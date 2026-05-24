/**
 * A109-F1: Visible AI disclosure component for published pages.
 *
 * EU AI Act Art. 50(4) requires that deployers of AI systems that generate
 * text inform natural persons that they are interacting with AI-generated
 * content. This component renders a visible disclosure badge.
 *
 * Usage: Render on any page where the underlying content has
 * `generated_by_ai === true` or `ai_generated === true`.
 */

interface AiContentDisclosureProps {
  /** Language for the disclosure text. Defaults to "en". */
  language?: "en" | "ar";
  /** Optional CSS class override. */
  className?: string;
}

const DISCLOSURE_TEXT = {
  en: "This article was drafted with the assistance of AI and reviewed by an editor.",
  ar: "تمت صياغة هذا المقال بمساعدة الذكاء الاصطناعي وتمت مراجعته بواسطة محرر.",
} as const;

export function AiContentDisclosure({ language = "en", className }: AiContentDisclosureProps) {
  const text = DISCLOSURE_TEXT[language] ?? DISCLOSURE_TEXT.en;
  const dir = language === "ar" ? "rtl" : "ltr";

  return (
    <aside
      role="note"
      aria-label="AI content disclosure"
      dir={dir}
      className={
        className ??
        "mt-8 border-t border-gray-200 pt-4 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400"
      }
    >
      <span aria-hidden="true" className="mr-1.5">
        &#x1F916;
      </span>
      {text}
    </aside>
  );
}
