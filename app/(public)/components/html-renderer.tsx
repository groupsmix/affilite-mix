import { sanitizeHtmlMemoized } from "@/lib/sanitize-html";
import { looksLikeMarkdown, markdownToHtml } from "@/lib/markdown";
import { cn } from "@/lib/utils";

interface HtmlRendererProps {
  html: string;
  direction?: "ltr" | "rtl";
  className?: string;
  invert?: boolean;
}

/**
 * Renders sanitized HTML content with proper formatting styles.
 * Uses the shared sanitizeHtml utility from lib/sanitize-html.ts.
 * Supports RTL layouts via the direction prop.
 *
 * audit5-#24: switched from the bare `sanitizeHtml` to the bounded
 * LRU-memoized variant. This is a React server component so `useMemo`
 * is a no-op across requests; the LRU lives at module scope and gives
 * us cross-request reuse for identical HTML bodies (typical of content
 * pages rendered through ISR). Cache key is the exact input string so
 * there is no tenant-leak risk — identical inputs always produce
 * identical outputs.
 */
export function HtmlRenderer({ html, direction = "ltr", className, invert }: HtmlRendererProps) {
  const isRtl = direction === "rtl";

  return (
    <div
      dir={direction}
      className={cn(
        "prose prose-lg max-w-none prose-headings:font-semibold prose-a:no-underline hover:prose-a:underline prose-img:rounded-lg prose-pre:overflow-x-auto",
        invert && "prose-invert",
        isRtl && "text-right",
        className,
      )}
      style={{ "--tw-prose-links": "var(--color-accent, #10B981)" } as React.CSSProperties}
      // Convert Markdown bodies (common for AI-generated drafts) to HTML before
      // sanitising; existing HTML content is left untouched.
      dangerouslySetInnerHTML={{
        __html: sanitizeHtmlMemoized(looksLikeMarkdown(html) ? markdownToHtml(html) : html),
      }}
    />
  );
}
