interface HtmlRendererProps {
  html: string;
}

/** Allowed HTML tags for content body rendering */
const ALLOWED_TAGS = new Set([
  "p", "br", "strong", "em", "b", "i", "u", "s",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "a", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td",
  "img", "figure", "figcaption",
  "div", "span", "hr",
]);

/** Allowed attributes per tag */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "title", "target", "rel"]),
  img: new Set(["src", "alt", "width", "height"]),
  td: new Set(["colspan", "rowspan"]),
  th: new Set(["colspan", "rowspan"]),
};

/**
 * Simple HTML sanitizer that strips disallowed tags and attributes.
 * Keeps only safe formatting tags for content rendering.
 */
function sanitizeHtml(html: string): string {
  // Remove script tags and their content entirely
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove style tags and their content
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, "");
  // Remove event handlers (on*)
  cleaned = cleaned.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");
  // Remove javascript: protocol
  cleaned = cleaned.replace(/javascript\s*:/gi, "");

  // Strip disallowed tags but keep content
  cleaned = cleaned.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*\/?>/gi, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      return "";
    }
    // For allowed tags, strip disallowed attributes
    const allowedAttrs = ALLOWED_ATTRS[tag];
    if (!allowedAttrs) {
      // No attributes allowed for this tag — strip all attributes
      if (match.startsWith("</")) return `</${tag}>`;
      const selfClosing = match.endsWith("/>");
      return selfClosing ? `<${tag} />` : `<${tag}>`;
    }
    // Keep only allowed attributes
    const attrRegex = /\s([a-z][a-z0-9-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/gi;
    let attrs = "";
    let attrMatch;
    while ((attrMatch = attrRegex.exec(match)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
      if (allowedAttrs.has(attrName)) {
        attrs += ` ${attrName}="${attrValue}"`;
      }
    }
    if (match.startsWith("</")) return `</${tag}>`;
    const selfClosing = match.endsWith("/>");
    return selfClosing ? `<${tag}${attrs} />` : `<${tag}${attrs}>`;
  });

  return cleaned;
}

/**
 * Renders sanitized HTML content with proper formatting styles.
 */
export function HtmlRenderer({ html }: HtmlRendererProps) {
  const sanitized = sanitizeHtml(html);

  return (
    <div
      className="prose prose-lg max-w-none prose-headings:font-semibold prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg"
      style={{ "--tw-prose-links": "var(--color-accent, #10B981)" } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: sanitized }}
    />
  );
}
