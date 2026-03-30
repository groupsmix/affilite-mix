/**
 * Server-side HTML sanitizer.
 * Uses htmlparser2 (pure-JS parser) with an allowlist approach — only permitted
 * tags and attributes survive. Prevents stored XSS from admin-authored content.
 *
 * Compatible with Cloudflare Workers (no JSDOM / DOMPurify dependency).
 */

import { Parser } from "htmlparser2";

const ALLOWED_TAGS = new Set([
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "a", "img",
  "strong", "b", "em", "i", "u", "s", "del", "ins",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
  "div", "span",
  "figure", "figcaption",
  "sup", "sub",
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

const DANGEROUS_PROTOCOLS = /^\s*(javascript|data|vbscript)\s*:/i;

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

      // Check href/src for dangerous protocols
      if ((lc === "href" || lc === "src") && DANGEROUS_PROTOCOLS.test(value)) {
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
export function sanitizeHtml(html: string): string {
  if (!html) return html;

  const chunks: string[] = [];

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = name.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) return;

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
        const tag = name.toLowerCase();
        if (!ALLOWED_TAGS.has(tag) || VOID_TAGS.has(tag)) return;
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
