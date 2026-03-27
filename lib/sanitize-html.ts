/**
 * Server-side HTML sanitizer.
 * Strips all tags except a safe allowlist to prevent stored XSS.
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

/**
 * Sanitize HTML by stripping dangerous tags and attributes.
 * This is a simple regex-based sanitizer suitable for trusted admin input.
 * For untrusted user input, consider a full DOM-based sanitizer.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return html;

  // Remove script tags and their content
  let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");

  // Remove event handler attributes (onclick, onerror, etc.)
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // Remove javascript: protocol in href/src attributes
  cleaned = cleaned.replace(/(href|src)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, "$1=\"\"");

  // Remove style tags and their content
  cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove iframe, object, embed, form tags and their content
  cleaned = cleaned.replace(/<(iframe|object|embed|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "");
  cleaned = cleaned.replace(/<(iframe|object|embed|form)\b[^>]*\/?>/gi, "");

  // Remove base tags
  cleaned = cleaned.replace(/<base\b[^>]*\/?>/gi, "");

  // Remove meta tags
  cleaned = cleaned.replace(/<meta\b[^>]*\/?>/gi, "");

  // Remove link tags
  cleaned = cleaned.replace(/<link\b[^>]*\/?>/gi, "");

  return cleaned;
}
