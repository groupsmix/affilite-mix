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
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan", "scope"]),
  ol: new Set(["start", "type"]),
  blockquote: new Set(["cite"]),
  code: new Set(["class"]),
  pre: new Set(["class"]),
  div: new Set(["class"]),
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
 *   - Absolute URLs with schemes `http:`, `https:`, `mailto:`, `tel:`
 *   - Relative / site-root URLs (`/foo`, `foo/bar`, `../x`)
 *   - In-page anchors (`#id`)
 */
const ALLOWED_URL_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

function isSafeUrl(value: string): boolean {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (trimmed.length === 0) return false;

  // Relative URLs and same-page anchors never specify a scheme.
  if (trimmed.startsWith("#")) return true;
  if (trimmed.startsWith("/")) return true;

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

  return ALLOWED_URL_SCHEMES.has(schemeMatch[1].toLowerCase() + ":");
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
 * Build a safe attribute string for an allowed tag.
 * - Only attributes in ALLOWED_ATTRS for that tag are kept.
 * - Event handlers (on*) and style attributes are always stripped.
 * - javascript: / data: / vbscript: protocols in href/src are stripped.
 * - <a> tags always get rel="noopener noreferrer nofollow".
 */
function buildAttrs(tag: string, raw: Record<string, string>): string {
  const allowedSet = ALLOWED_ATTRS[tag];
  const parts: string[] = [];

  if (allowedSet) {
    for (const [name, value] of Object.entries(raw)) {
      const lc = name.toLowerCase();

      // Always strip event handlers and style
      if (lc.startsWith("on") || lc === "style") continue;

      if (!allowedSet.has(lc)) continue;

      // Lock href/src to the scheme allow-list defined above.
      if ((lc === "href" || lc === "src") && !isSafeUrl(value)) {
        continue;
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
/**
 * Sanitize CSS by stripping dangerous patterns that could be used for
 * data exfiltration or UI manipulation:
 * - @import rules (can load external stylesheets)
 * - url() values (can exfiltrate data via external requests)
 * - expression() (IE CSS expressions — legacy XSS vector)
 * - behavior/binding properties (IE/Mozilla XSS vectors)
 * - javascript:/data: protocols
 */
export function sanitizeCss(css: string): string {
  if (!css) return css;

  return (
    css
      // Strip @import rules
      .replace(/@import\s+[^;]+;?/gi, "/* @import removed */")
      // Strip url() values (used for data exfiltration)
      .replace(/url\s*\([^)]*\)/gi, "/* url() removed */")
      // Strip expression() (IE CSS expressions)
      .replace(/expression\s*\([^)]*\)/gi, "/* expression() removed */")
      // Strip -moz-binding (Mozilla XSS vector)
      .replace(/-moz-binding\s*:[^;]+;?/gi, "/* -moz-binding removed */")
      // Strip behavior (IE XSS vector)
      .replace(/behavior\s*:[^;]+;?/gi, "/* behavior removed */")
  );
}

export function sanitizeHtml(html: string): string {
  if (!html) return html;

  const chunks: string[] = [];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const raw = name.toLowerCase();
        if (!ALLOWED_TAGS.has(raw)) return;

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
        chunks.push(text);
      },

      onclosetag(name) {
        const raw = name.toLowerCase();
        if (!ALLOWED_TAGS.has(raw) || VOID_TAGS.has(raw)) return;
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
