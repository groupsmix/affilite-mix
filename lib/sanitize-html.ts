/**
 * Server-side HTML sanitizer.
 * Uses htmlparser2 (pure-JS parser) with an allowlist approach — only permitted
 * tags and attributes survive. Prevents stored XSS from admin-authored content.
 *
 * Compatible with Cloudflare Workers (no JSDOM / DOMPurify dependency).
 */

import { Parser } from "htmlparser2";

const ALLOWED_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "del",
  "ins",
  "blockquote",
  "pre",
  "code",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "div",
  "span",
  "figure",
  "figcaption",
  "sup",
  "sub",
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "title", "width", "height", "loading"]),
  h1: new Set(["id"]),
  h2: new Set(["id"]),
  h3: new Set(["id"]),
  h4: new Set(["id"]),
  h5: new Set(["id"]),
  h6: new Set(["id"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  ol: new Set(["start", "type"]),
  blockquote: new Set(["cite"]),
  code: new Set(["class"]),
  pre: new Set(["class"]),
  div: new Set(["class", "data-ai-generated"]),
  span: new Set(["class"]),
};

const VOID_TAGS = new Set(["br", "hr", "img"]);

/**
 * Heading level remapping: <h1> in user-authored content is demoted to <h2>
 * to preserve the page's heading hierarchy (the page already has its own <h1>).
 */
const HEADING_REMAP: Record<string, string> = { h1: "h2" };

/**
 * Allow-list of URL schemes permitted in `href`/`src` attributes.
 *
 * Deny-lists are fragile — `javascript:`, `data:`, and `vbscript:` are
 * the well-known offenders but browsers keep inventing new ones
 * (`blob:`, `filesystem:`, `intent:` on Android, etc.). An allow-list
 * locks URLs to the small set we actually want users to author.
 *
 * Accepted forms:
 *   - Absolute URLs with schemes `http:`, `https:`
 *   - Relative / site-root URLs (`/foo`, `foo/bar`, `../x`)
 *   - In-page anchors (`#id`)
 */
const ALLOWED_URL_SCHEMES = new Set(["http:", "https:"]);

/**
 * URLs are pre-cleaned to match what the browser will actually resolve:
 *   - Leading/trailing C0 control characters (U+0000..U+001F) and space
 *     are stripped by the URL parser (WHATWG URL spec §4.4).
 *   - ASCII tab, LF and CR inside the URL are stripped everywhere.
 * Without this, crafted inputs like `java\tscript:` or `\x01javascript:`
 * would sneak past scheme detection and still be resolved as
 * `javascript:` by the browser.
 */
export function isSafeUrl(value: string): boolean {
  if (typeof value !== "string") return false;

  // Strip all ASCII tab, newline, carriage-return, and backtick characters
  // (anywhere in the string — the URL parser removes tab/NL/CR globally).
  // Backticks are stripped because some parsers (including htmlparser2) may
  // pass backtick-quoted attribute values with the backticks intact; browsers
  // resolve `javascript:...` wrapped in backticks as a valid URL.
  // P-01: Use iterative trimming instead of ReDoS-prone regex for C0 controls
  let trimmed = value.replace(/[\t\n\r`]/g, "");
  let start = 0;
  let end = trimmed.length;
  while (start < end && trimmed.charCodeAt(start) <= 0x20) start++;
  while (end > start && trimmed.charCodeAt(end - 1) <= 0x20) end--;
  trimmed = trimmed.slice(start, end);
  if (trimmed.length === 0) return false;

  // Relative URLs and same-page anchors never specify a scheme.
  if (trimmed.startsWith("#")) return true;
  // AM-13: Reject protocol-relative URLs (//evil.example/x) which browsers
  // resolve to the current page's protocol, enabling external resource loading.
  if (trimmed.startsWith("//")) return false;
  if (trimmed.startsWith("/")) return true;

  // A112-F2: Explicitly block data: URIs which could embed SVG with script
  // via <img src="data:image/svg+xml,..."> even within allowlisted tags.
  if (trimmed.toLowerCase().startsWith("data:")) return false;

  // Detect an explicit scheme. The regex matches the URL scheme grammar
  // (alpha, followed by alpha/digit/+/-/.) — identical to how browsers
  // parse the leading component of a URL.
  const schemeMatch = /^([a-z][a-z0-9+\-.]*):/i.exec(trimmed);
  if (!schemeMatch) {
    // No scheme and no leading `/` or `#`: treat as a relative path
    // (e.g. `foo/bar`, `page.html`). Still safe — the browser resolves
    // it against the document base URL and cannot escape it.
    return true;
  }

  return ALLOWED_URL_SCHEMES.has(schemeMatch[1]!.toLowerCase() + ":");
}

/** Escape special characters in attribute values */
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * F-XSS-01: Escape special characters in text content before emitting
 * back into the output buffer.
 *
 * htmlparser2 defaults to `decodeEntities: true`, so every `&lt;` /
 * `&gt;` / `&amp;` / `&#x3c;` / `&#60;` / named entity in user input
 * is decoded to its raw character BEFORE the `ontext` callback fires.
 * If we push the decoded text back out verbatim, the browser parses
 * those raw characters as new HTML markup when it reads the result
 * via `dangerouslySetInnerHTML`, completely bypassing the tag /
 * attribute allow-list.
 *
 * Concrete bypass (pre-fix):
 *   IN  : <p>&amp;lt;img src=x onerror=alert(1)&amp;gt;</p>
 *   ① (sanitize on write): <p>&lt;img src=x onerror=alert(1)&gt;</p>
 *   ② (sanitize on read) : <p><img src=x onerror=alert(1)></p>
 *                          ^^^ executed by the browser via innerHTML
 *
 * Re-escaping `<`, `>`, `&` in text content closes the loop so that
 * `ontext("<img src=…>")` is emitted as `&lt;img src=…&gt;` and
 * faithfully renders as visible text instead of being re-parsed as
 * markup.
 */
function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build a safe attribute string for an allowed tag.
 * - Only attributes in ALLOWED_ATTRS for that tag are kept.
 * - Event handlers (on*) and style attributes are always stripped.
 * - javascript: / data: / vbscript: protocols in href/src are stripped.
 * - <a> tags always get rel="noopener noreferrer nofollow".
 */
/**
 * F-041: Make ALLOWED_CLASSES data-driven to support any language prefix
 * without hardcoding the list of languages.
 */
function isAllowedClass(cls: string): boolean {
  if (cls.startsWith("language-")) return true;
  if (["text-left", "text-center", "text-right", "text-justify"].includes(cls)) return true;
  return false;
}

function buildAttrs(tag: string, raw: Record<string, string>): string {
  const allowedSet = ALLOWED_ATTRS[tag];
  const parts: string[] = [];

  if (allowedSet) {
    for (const [name, value] of Object.entries(raw)) {
      const lc = name.toLowerCase();

      // Always strip event handlers and style
      if (lc.startsWith("on") || lc === "style") continue;

      if (!allowedSet.has(lc)) continue;

      // Restrict classes to a strict allow-list to prevent UI redressing
      if (lc === "class") {
        const safeClasses = value.split(/\s+/).filter(isAllowedClass).join(" ");
        if (!safeClasses) continue;
        parts.push(`class="${escapeAttrValue(safeClasses)}"`);
        continue;
      }

      // Lock href/src to the scheme allow-list defined above.
      if ((lc === "href" || lc === "src") && !isSafeUrl(value)) {
        continue;
      }

      // SEC-07 (etap-3): restrict <a target> to known-safe values.
      // `_top` and `_parent` allow sanitised content to navigate the
      // embedding frame; if the rendered HTML is ever shown inside an
      // iframe (preview/partner embeds), authored content could break
      // out of the frame. Forcing target to {_blank, _self} preserves
      // the only intended editorial use cases ("open in same tab" and
      // "open in new tab", paired with the rel="noopener noreferrer
      // nofollow" we set below).
      if (tag === "a" && lc === "target") {
        if (value !== "_blank" && value !== "_self") continue;
      }

      // Skip user-supplied rel on <a> — we force our own below
      if (tag === "a" && lc === "rel") continue;

      parts.push(`${lc}="${escapeAttrValue(value)}"`);
    }
  }

  // Force safe rel on <a> tags
  if (tag === "a") {
    parts.push('rel="noopener noreferrer nofollow"');
  }

  return parts.length > 0 ? " " + parts.join(" ") : "";
}

/**
 * Sanitize HTML using htmlparser2 with a tag/attribute allowlist.
 * - Strips all tags not in ALLOWED_TAGS
 * - Strips all attributes not in ALLOWED_ATTRS for that tag
 * - Removes javascript:/data:/vbscript: protocols in href/src
 * - Forces rel="noopener noreferrer nofollow" on all <a> tags
 * - Removes event handler attributes (on*)
 */
export const MAX_INPUT_LENGTH = 100_000; // Shared constant — also used by lib/validation.ts

/**
 * A73-F1: Maximum allowed nesting depth for HTML elements. Deeply nested
 * structures (e.g., 10,000 nested divs) cause O(n*depth) CPU consumption
 * in the parser. Elements beyond this depth are flattened (their content
 * is preserved but the wrapping tag is dropped).
 */
const MAX_NESTING_DEPTH = 100;

export function sanitizeHtml(html: string): string {
  // LIB-4: never propagate a falsy input (null/undefined/empty) back to the
  // caller. Returning the raw value here meant `sanitizeHtml(null)` returned
  // `null`, which then flowed straight into
  // `dangerouslySetInnerHTML={{ __html: null }}` and bypassed the contract.
  // The declared return type is `string`, so "" is the faithful empty result.
  if (!html) return "";

  if (html.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input exceeds maximum allowed length of ${MAX_INPUT_LENGTH} characters`);
  }

  const chunks: string[] = [];

  // Track depth inside disallowed tags so their text content is also dropped.
  // Without this, a payload like `<style>body{background:url(javascript:...)}</style>`
  // would leak its CSS body as plain text even though the <style> wrapper is stripped.
  let suppressDepth = 0;

  // A73-F1: Track current nesting depth to prevent CPU exhaustion from
  // deeply nested HTML. Tags beyond MAX_NESTING_DEPTH are flattened.
  let currentDepth = 0;
  let depthExceededCount = 0;

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const raw = name.toLowerCase();
        if (!ALLOWED_TAGS.has(raw)) {
          if (!VOID_TAGS.has(raw)) suppressDepth++;
          return;
        }

        // A73-F1: Reject excessively nested elements — flatten them to prevent
        // O(n*depth) CPU consumption on malicious deeply-nested input.
        if (!VOID_TAGS.has(raw)) {
          currentDepth++;
          if (currentDepth > MAX_NESTING_DEPTH) {
            depthExceededCount++;
            return;
          }
        }

        // Remap h1 → h2 so user content doesn't break page heading hierarchy
        const tag = HEADING_REMAP[raw] ?? raw;
        const attrStr = buildAttrs(tag, attribs);

        if (VOID_TAGS.has(tag)) {
          chunks.push(`<${tag}${attrStr} />`);
        } else {
          chunks.push(`<${tag}${attrStr}>`);
        }
      },

      ontext(text) {
        if (suppressDepth > 0) return;
        // F-XSS-01: htmlparser2 decodes entities (decodeEntities: true by
        // default), so `text` here is the raw decoded string. Re-escape
        // `<`, `>`, `&` so an attacker cannot smuggle markup through the
        // text-node stream — see comment on `escapeText` above for the
        // bypass chain this closes.
        chunks.push(escapeText(text));
      },

      onclosetag(name) {
        const raw = name.toLowerCase();
        if (!ALLOWED_TAGS.has(raw)) {
          if (!VOID_TAGS.has(raw) && suppressDepth > 0) suppressDepth--;
          return;
        }
        if (VOID_TAGS.has(raw)) return;

        // A73-F1: Track depth reduction. If this tag was flattened on open,
        // just decrement without emitting a close tag.
        if (!VOID_TAGS.has(raw)) {
          if (currentDepth > MAX_NESTING_DEPTH) {
            currentDepth--;
            depthExceededCount = Math.max(0, depthExceededCount - 1);
            return;
          }
          currentDepth--;
        }

        const tag = HEADING_REMAP[raw] ?? raw;
        chunks.push(`</${tag}>`);
      },
    },
    {
      recognizeSelfClosing: true,
      lowerCaseTags: true,
      lowerCaseAttributeNames: true,
    },
  );

  parser.write(html);
  parser.end();

  return chunks.join("");
}

/**
 * audit5-#24, audit5-#32: bounded process-level memoizer for `sanitizeHtml`.
 *
 * `app/(public)/components/html-renderer.tsx` and
 * `app/(public)/p/[pageSlug]/page.tsx` are React **server** components.
 * `useMemo` does not memoize across requests in RSC mode (each request
 * gets a fresh component tree), so the audit's recommended `useMemo`
 * wrapping has no effect for these server-only callers. The proper
 * server-side optimisation is a bounded module-scoped LRU cache —
 * sanitize is pure on input (no tenant-specific state, no I/O), so
 * caching by exact input string is safe across tenants: identical
 * input always produces identical output, and the cache stores no
 * information beyond what callers already supplied.
 *
 * Issue 11: Memory-growth invariants — two bounds work together to prevent
 * unbounded memory growth even under adversarial input:
 *   1. `MAX_INPUT_LENGTH = 100_000` — enforced as a hard pre-check before
 *      every cache lookup. Inputs longer than 100 KB are rejected with an
 *      error and never enter the cache, bounding the maximum size of any
 *      single cached value.
 *   2. `MEMO_CAPACITY = 64` — the LRU evicts the least-recently-used entry
 *      whenever the cache reaches this limit, bounding the total number of
 *      cached values.
 * Together these two invariants cap worst-case memory at
 * 64 × 100 KB ≈ 6.4 MB — acceptable for a long-lived server process and
 * safe under both high-cardinality inputs and adversarial cache-flooding.
 * Do not remove either bound without re-evaluating the memory budget.
 */
const MEMO_CAPACITY = 64;
const memoCache = new Map<string, string>();

export function sanitizeHtmlMemoized(html: string): string {
  // LIB-4: same null-safety as sanitizeHtml — see comment there.
  if (!html) return "";

  // Pre-validate length so we never cache oversize inputs.
  if (html.length > MAX_INPUT_LENGTH) {
    throw new Error(`Input exceeds maximum allowed length of ${MAX_INPUT_LENGTH} characters`);
  }

  const cached = memoCache.get(html);
  if (cached !== undefined) {
    // LRU touch: re-insert to mark "most recently used". `Map`
    // iteration order is insertion order, so deleting + re-setting
    // moves the entry to the end without copying any state.
    memoCache.delete(html);
    memoCache.set(html, cached);
    return cached;
  }

  const sanitized = sanitizeHtml(html);

  // Evict oldest entry if at capacity. The first key returned by
  // `keys()` is the least-recently-used entry under the touch policy
  // above.
  if (memoCache.size >= MEMO_CAPACITY) {
    const oldestKey = memoCache.keys().next().value;
    if (oldestKey !== undefined) memoCache.delete(oldestKey);
  }
  memoCache.set(html, sanitized);
  return sanitized;
}

/**
 * Exported for the audit5-#24/#32 unit test only — gives the test
 * a deterministic way to clear inter-suite state without exporting
 * the cache itself.
 */
export function _resetSanitizeHtmlMemoCacheForTests(): void {
  memoCache.clear();
}
