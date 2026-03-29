import { sanitizeHtml } from "@/lib/sanitize-html";

interface HtmlRendererProps {
  html: string;
}

/**
 * Renders sanitized HTML content with proper formatting styles.
 * Uses the shared sanitizeHtml utility from lib/sanitize-html.ts.
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
