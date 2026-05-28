import { sanitizeHtml } from "@/lib/sanitize-html";

interface HtmlRendererProps {
  html: string;
  direction?: "ltr" | "rtl";
}

/**
 * Renders sanitized HTML content with proper formatting styles.
 * Uses the shared sanitizeHtml utility from lib/sanitize-html.ts.
 * Supports RTL layouts via the direction prop.
 */
export function HtmlRenderer({ html, direction = "ltr" }: HtmlRendererProps) {
  const isRtl = direction === "rtl";

  return (
    <div
      dir={direction}
      className={`prose prose-lg max-w-none prose-headings:font-semibold prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-pre:overflow-x-auto ${isRtl ? "text-right" : ""}`}
      style={{ "--tw-prose-links": "var(--color-accent, #10B981)" } as React.CSSProperties}
      // audit-etap1 #6: sanitizer call inlined at the JSX site so the ESLint
      // rule statically verifies every `dangerouslySetInnerHTML` is wrapped.
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}
