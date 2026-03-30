/**
 * Server-side HTML sanitizer.
 * Uses an allowlist approach — only permitted tags and attributes survive.
 * Prevents stored XSS from admin-authored content.
 *
 * NOTE: This regex-based sanitizer works well for trusted admin input but
 * should be supplemented with a proper HTML parser (e.g. DOMPurify with JSDOM)
 * before allowing any user-generated content. DOMPurify is not added here
 * because JSDOM is incompatible with the Cloudflare Workers runtime. When/if
 * the sanitization pipeline moves to a Node.js environment, add DOMPurify
 * as a secondary check after this fast-path pass.
 */

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

/**
 * Sanitize HTML using a tag/attribute allowlist.
 * - Strips all tags not in ALLOWED_TAGS
 * - Strips all attributes not in ALLOWED_ATTRS for that tag
 * - Removes javascript:/data:/vbscript: protocol in href/src
 * - Forces rel="noopener noreferrer nofollow" on all <a> tags
 * - Removes event handler attributes (on*)
 */
export function sanitizeHtml(html: string): string {
  if (!html) return html;

  // Process the HTML by replacing tags through a single pass
  return html.replace(
    /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)?\/?>/g,
    (fullMatch, tagName: string, attrString: string | undefined) => {
      const tag = tagName.toLowerCase();

      // Closing tag
      if (fullMatch.startsWith("</")) {
        if (!ALLOWED_TAGS.has(tag) || VOID_TAGS.has(tag)) return "";
        return `</${tag}>`;
      }

      // Opening / self-closing tag
      if (!ALLOWED_TAGS.has(tag)) return "";

      const allowedAttrsForTag = ALLOWED_ATTRS[tag];
      const attrs: string[] = [];

      if (attrString) {
        // Parse attributes
        const attrPattern = /([a-zA-Z][a-zA-Z0-9_-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
        let attrMatch: RegExpExecArray | null;

        while ((attrMatch = attrPattern.exec(attrString)) !== null) {
          const attrName = attrMatch[1].toLowerCase();
          const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";

          // Skip event handlers (onclick, onerror, etc.)
          if (attrName.startsWith("on")) continue;

          // Skip style attribute (potential XSS vector)
          if (attrName === "style") continue;

          // Only allow attributes in the allowlist for this tag
          if (!allowedAttrsForTag || !allowedAttrsForTag.has(attrName)) continue;

          // Check href/src for dangerous protocols
          if ((attrName === "href" || attrName === "src") && DANGEROUS_PROTOCOLS.test(attrValue)) {
            continue;
          }

          attrs.push(`${attrName}="${escapeAttrValue(attrValue)}"`);
        }
      }

      // Force safe rel on <a> tags
      if (tag === "a") {
        const filteredAttrs = attrs.filter((a) => !a.startsWith("rel="));
        filteredAttrs.push('rel="noopener noreferrer nofollow"');
        const attrStr = filteredAttrs.length > 0 ? " " + filteredAttrs.join(" ") : "";
        return `<a${attrStr}>`;
      }

      const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";

      if (VOID_TAGS.has(tag)) {
        return `<${tag}${attrStr} />`;
      }

      return `<${tag}${attrStr}>`;
    },
  );
}

/** Escape special characters in attribute values */
function escapeAttrValue(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
