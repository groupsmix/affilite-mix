"use client";

import Link from "next/link";

const translations = {
  en: {
    heading: "We\u2019re having trouble loading this page",
    fallback: "An unexpected error occurred. Please try again.",
    retry: "Try again",
    home: "Go to Homepage",
  },
  ar: {
    heading: "\u0646\u0648\u0627\u062c\u0647 \u0645\u0634\u0643\u0644\u0629 \u0641\u064a \u062a\u062d\u0645\u064a\u0644 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062d\u0629",
    fallback: "\u062d\u062f\u062b \u062e\u0637\u0623 \u063a\u064a\u0631 \u0645\u062a\u0648\u0642\u0639. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    retry: "\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649",
    home: "\u0627\u0644\u0639\u0648\u062f\u0629 \u0625\u0644\u0649 \u0627\u0644\u0635\u0641\u062d\u0629 \u0627\u0644\u0631\u0626\u064a\u0633\u064a\u0629",
  },
} as const;

/**
 * Detect language from the <html lang> attribute set by the public layout.
 * Falls back to "en" if not available (e.g. during SSR or outside the public layout).
 */
function detectLanguage(): "en" | "ar" {
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang;
    if (lang === "ar") return "ar";
  }
  return "en";
}

export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const lang = detectLanguage();
  const t = translations[lang];

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center px-4 py-16 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
        <svg
          className="h-8 w-8 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
          />
        </svg>
      </div>

      <h2 className="mb-2 text-2xl font-bold text-gray-900">
        {t.heading}
      </h2>
      <p className="mb-8 text-sm text-gray-500">
        {process.env.NODE_ENV === "development"
          ? error.message || t.fallback
          : t.fallback}
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={reset}
          className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          {t.retry}
        </button>
        <Link
          href="/"
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          {t.home}
        </Link>
      </div>
    </div>
  );
}
