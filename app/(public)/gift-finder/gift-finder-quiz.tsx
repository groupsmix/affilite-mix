"use client";

import { useState } from "react";
import Link from "next/link";

function ResultSkeleton({ language = "en" }: { language?: string }) {
  const t = getStrings(language);
  return (
    <div
      className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8"
      dir={language === "ar" ? "rtl" : "ltr"}
    >
      <div className="mb-12 text-center">
        <div className="mx-auto mb-2 h-4 w-24 animate-pulse rounded bg-gray-200" />
        <div className="mx-auto mb-4 h-9 w-72 animate-pulse rounded bg-gray-200" />
        <div className="mx-auto h-5 w-96 max-w-full animate-pulse rounded bg-gray-200" />
      </div>
      <div className="space-y-6">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`rounded-xl border bg-white p-6 shadow-sm md:p-8 ${
              i === 0 ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200"
            }`}
          >
            <div className="mb-4 h-6 w-28 animate-pulse rounded-full bg-gray-200" />
            <div className="mb-2 h-6 w-48 animate-pulse rounded bg-gray-200" />
            <div className="mb-3 flex gap-3">
              <div className="h-5 w-24 animate-pulse rounded bg-gray-200" />
              <div className="h-5 w-16 animate-pulse rounded bg-gray-200" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-gray-200" />
            </div>
            <div className="mb-5 space-y-2">
              <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
            </div>
            <div className="flex gap-3">
              <div className="h-12 w-32 animate-pulse rounded-full bg-gray-200" />
              <div className="h-12 w-36 animate-pulse rounded-full bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-sm text-gray-500">{t.findingMatches}</p>
    </div>
  );
}

interface GiftFinderResult {
  name: string;
  slug: string;
  price_label: string | null;
  price_amount: number | null;
  price_currency: string;
  score: number | null;
  /** Internal /r/[slug] redirect. The API suppresses the raw affiliate_url. */
  redirect_url?: string;
  /** Real review page URL, present only when a published review exists. */
  review_url?: string;
  image_url: string;
  description: string;
  merchant: string;
  deal_text: string;
}

interface GiftFinderQuizProps {
  productLabel: string;
  productLabelPlural: string;
  language?: string;
}

const i18n = {
  en: {
    quizSubtitle: "60-Second Quiz",
    quizTitle: (label: string) => `${label} Gift Finder Quiz`,
    quizDescription: (label: string) =>
      `Answer 4 quick questions and get personalized ${label.toLowerCase()} recommendations in 60 seconds.`,
    stepOf: (current: number, total: number) => `Step ${current} of ${total}`,
    goBack: "Go Back",
    yourResults: "Your Results",
    perfectMatches: (label: string) => `Your Perfect ${label} Matches`,
    matchesDescription: (plural: string) =>
      `Based on your answers, here are the ${plural.toLowerCase()} we recommend \u2014 sorted by Gift-Worthiness Score.`,
    giftScore: (score: number) => `Gift Score: ${score}/10`,
    viewDeal: "View Deal",
    readFullReview: "Read Full Review",
    noMatchesTitle: "No Matches Found",
    noMatches: (plural: string) =>
      `We couldn't find ${plural.toLowerCase()} matching all your criteria. Try adjusting your budget or style preference.`,
    retakeQuiz: "Retake the Quiz",
    seeAllReviews: "See All Reviews",
    browseComparisons: "Browse Comparisons",
    retry: "Retry",
    startOver: "Start Over",
    unableToLoad: "Unable to Load Recommendations",
    errorMessage: "Something went wrong while fetching recommendations. Please try again.",
    findingMatches: "Finding your perfect matches...",
    rankLabels: ["Our #1 Pick", "Runner-Up", "Also Consider"] as readonly string[],
    steps: [
      {
        id: "recipient",
        title: "Who are you buying for?",
        options: [
          { value: "partner", label: "Partner / Spouse" },
          { value: "parent", label: "Parent" },
          { value: "significant_other", label: "Significant Other" },
          { value: "child", label: "Son / Daughter" },
          { value: "friend", label: "Friend" },
          { value: "self", label: "Myself" },
        ],
      },
      {
        id: "occasion",
        title: "What\u2019s the occasion?",
        options: [
          { value: "holiday", label: "Holiday Gift" },
          { value: "christmas", label: "Christmas" },
          { value: "birthday", label: "Birthday" },
          { value: "valentines", label: "Valentine\u2019s Day" },
          { value: "anniversary", label: "Anniversary" },
          { value: "graduation", label: "Graduation" },
          { value: "other", label: "Just Because" },
        ],
      },
      {
        id: "budget",
        title: "What\u2019s your budget?",
        options: [
          { value: "100", label: "Under $100" },
          { value: "200", label: "Under $200" },
          { value: "350", label: "Under $350" },
          { value: "500", label: "Under $500" },
          { value: "1000", label: "$500\u2013$1,000" },
          { value: "9999", label: "$1,000+" },
        ],
      },
      {
        id: "style",
        title: "What style do you prefer?",
        options: [
          { value: "classic", label: "Classic / Dressy" },
          { value: "modern", label: "Modern / Minimalist" },
          { value: "sport", label: "Sporty / Active" },
          { value: "rugged", label: "Rugged / Outdoor" },
          { value: "dress", label: "Dress / Formal" },
          { value: "casual", label: "Casual / Everyday" },
        ],
      },
    ],
  },
  ar: {
    quizSubtitle: "\u0627\u062e\u062a\u0628\u0627\u0631 60 \u062b\u0627\u0646\u064a\u0629",
    quizTitle: (label: string) =>
      `\u0627\u062e\u062a\u0628\u0627\u0631 \u0627\u0644\u0628\u062d\u062b \u0639\u0646 ${label}`,
    quizDescription: (label: string) =>
      `\u0623\u062c\u0628 \u0639\u0644\u0649 4 \u0623\u0633\u0626\u0644\u0629 \u0633\u0631\u064a\u0639\u0629 \u0648\u0627\u062d\u0635\u0644 \u0639\u0644\u0649 \u062a\u0648\u0635\u064a\u0627\u062a ${label} \u0645\u062e\u0635\u0635\u0629 \u0641\u064a 60 \u062b\u0627\u0646\u064a\u0629.`,
    stepOf: (current: number, total: number) =>
      `\u0627\u0644\u062e\u0637\u0648\u0629 ${current} \u0645\u0646 ${total}`,
    goBack: "\u0631\u062c\u0648\u0639",
    yourResults: "\u0646\u062a\u0627\u0626\u062c\u0643",
    perfectMatches: (label: string) => `\u0623\u0641\u0636\u0644 ${label} \u0644\u0643`,
    matchesDescription: (plural: string) =>
      `\u0628\u0646\u0627\u0621\u064b \u0639\u0644\u0649 \u0625\u062c\u0627\u0628\u0627\u062a\u0643\u060c \u0625\u0644\u064a\u0643 ${plural} \u0627\u0644\u062a\u064a \u0646\u0648\u0635\u064a \u0628\u0647\u0627 \u2014 \u0645\u0631\u062a\u0628\u0629 \u062d\u0633\u0628 \u0645\u0639\u064a\u0627\u0631 \u0627\u0644\u0647\u062f\u064a\u0629.`,
    giftScore: (score: number) =>
      `\u0645\u0639\u064a\u0627\u0631 \u0627\u0644\u0647\u062f\u064a\u0629: ${score}/10`,
    viewDeal: "\u0639\u0631\u0636 \u0627\u0644\u0635\u0641\u0642\u0629",
    readFullReview:
      "\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629 \u0627\u0644\u0643\u0627\u0645\u0644\u0629",
    noMatchesTitle: "\u0644\u0627 \u062a\u0648\u062c\u062f \u0646\u062a\u0627\u0626\u062c",
    noMatches: (plural: string) =>
      `\u0644\u0645 \u0646\u062a\u0645\u0643\u0646 \u0645\u0646 \u0625\u064a\u062c\u0627\u062f ${plural} \u062a\u0637\u0627\u0628\u0642 \u0645\u0639\u0627\u064a\u064a\u0631\u0643. \u062d\u0627\u0648\u0644 \u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0645\u064a\u0632\u0627\u0646\u064a\u0629 \u0623\u0648 \u0627\u0644\u0623\u0633\u0644\u0648\u0628.`,
    retakeQuiz: "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0627\u062e\u062a\u0628\u0627\u0631",
    seeAllReviews:
      "\u0639\u0631\u0636 \u062c\u0645\u064a\u0639 \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0627\u062a",
    browseComparisons:
      "\u062a\u0635\u0641\u062d \u0627\u0644\u0645\u0642\u0627\u0631\u0646\u0627\u062a",
    retry: "\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629",
    startOver: "\u0627\u0644\u0628\u062f\u0621 \u0645\u0646 \u062c\u062f\u064a\u062f",
    unableToLoad:
      "\u062a\u0639\u0630\u0631 \u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a",
    errorMessage:
      "\u062d\u062f\u062b \u062e\u0637\u0623 \u0623\u062b\u0646\u0627\u0621 \u062c\u0644\u0628 \u0627\u0644\u062a\u0648\u0635\u064a\u0627\u062a. \u064a\u0631\u062c\u0649 \u0627\u0644\u0645\u062d\u0627\u0648\u0644\u0629 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    findingMatches:
      "\u062c\u0627\u0631\u064d \u0625\u064a\u062c\u0627\u062f \u0627\u0644\u062e\u064a\u0627\u0631\u0627\u062a \u0627\u0644\u0645\u062b\u0627\u0644\u064a\u0629...",
    rankLabels: [
      "\u0627\u0644\u062e\u064a\u0627\u0631 \u0627\u0644\u0623\u0648\u0644",
      "\u0627\u0644\u062e\u064a\u0627\u0631 \u0627\u0644\u062b\u0627\u0646\u064a",
      "\u0623\u064a\u0636\u064b\u0627 \u0646\u0642\u062a\u0631\u062d",
    ] as readonly string[],
    steps: [
      {
        id: "recipient",
        title: "\u0644\u0645\u0646 \u062a\u0634\u062a\u0631\u064a\u061f",
        options: [
          {
            value: "partner",
            label: "\u0627\u0644\u0634\u0631\u064a\u0643 / \u0627\u0644\u0632\u0648\u062c",
          },
          { value: "parent", label: "\u0627\u0644\u0648\u0627\u0644\u062f\u064a\u0646" },
          { value: "significant_other", label: "\u0634\u062e\u0635 \u0645\u0645\u064a\u0632" },
          { value: "child", label: "\u0627\u0628\u0646 / \u0627\u0628\u0646\u0629" },
          { value: "friend", label: "\u0635\u062f\u064a\u0642" },
          { value: "self", label: "\u0644\u0646\u0641\u0633\u064a" },
        ],
      },
      {
        id: "occasion",
        title: "\u0645\u0627 \u0627\u0644\u0645\u0646\u0627\u0633\u0628\u0629\u061f",
        options: [
          { value: "holiday", label: "\u0647\u062f\u064a\u0629 \u0639\u064a\u062f" },
          {
            value: "christmas",
            label: "\u0639\u064a\u062f \u0627\u0644\u0645\u064a\u0644\u0627\u062f",
          },
          { value: "birthday", label: "\u0639\u064a\u062f \u0645\u064a\u0644\u0627\u062f" },
          { value: "valentines", label: "\u0639\u064a\u062f \u0627\u0644\u062d\u0628" },
          {
            value: "anniversary",
            label: "\u0630\u0643\u0631\u0649 \u0633\u0646\u0648\u064a\u0629",
          },
          { value: "graduation", label: "\u062a\u062e\u0631\u062c" },
          {
            value: "other",
            label: "\u0628\u062f\u0648\u0646 \u0645\u0646\u0627\u0633\u0628\u0629",
          },
        ],
      },
      {
        id: "budget",
        title: "\u0645\u0627 \u0645\u064a\u0632\u0627\u0646\u064a\u062a\u0643\u061f",
        options: [
          { value: "100", label: "\u0623\u0642\u0644 \u0645\u0646 $100" },
          { value: "200", label: "\u0623\u0642\u0644 \u0645\u0646 $200" },
          { value: "350", label: "\u0623\u0642\u0644 \u0645\u0646 $350" },
          { value: "500", label: "\u0623\u0642\u0644 \u0645\u0646 $500" },
          { value: "1000", label: "$500\u2013$1,000" },
          { value: "9999", label: "$1,000+" },
        ],
      },
      {
        id: "style",
        title:
          "\u0645\u0627 \u0627\u0644\u0623\u0633\u0644\u0648\u0628 \u0627\u0644\u0645\u0641\u0636\u0644\u061f",
        options: [
          {
            value: "classic",
            label: "\u0643\u0644\u0627\u0633\u064a\u0643\u064a / \u0623\u0646\u064a\u0642",
          },
          { value: "modern", label: "\u0639\u0635\u0631\u064a / \u0628\u0633\u064a\u0637" },
          { value: "sport", label: "\u0631\u064a\u0627\u0636\u064a" },
          { value: "rugged", label: "\u0645\u062a\u064a\u0646 / \u062e\u0627\u0631\u062c\u064a" },
          { value: "dress", label: "\u0631\u0633\u0645\u064a" },
          { value: "casual", label: "\u0639\u0627\u062f\u064a / \u064a\u0648\u0645\u064a" },
        ],
      },
    ],
  },
} as const;

function getStrings(language: string) {
  return language === "ar" ? i18n.ar : i18n.en;
}

interface Answers {
  recipient: string;
  occasion: string;
  budget: string;
  style: string;
}

export function GiftFinderQuiz({
  productLabel,
  productLabelPlural,
  language = "en",
}: GiftFinderQuizProps) {
  const t = getStrings(language);
  const steps = t.steps;
  const rankLabels = t.rankLabels;
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  const [results, setResults] = useState<GiftFinderResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [animatingStep, setAnimatingStep] = useState(false);
  const [lastAnswers, setLastAnswers] = useState<Answers | null>(null);

  const fetchResults = async (finalAnswers: Answers) => {
    setLoading(true);
    setError(null);
    setLastAnswers(finalAnswers);
    try {
      const params = new URLSearchParams({
        budget: finalAnswers.budget,
        occasion: finalAnswers.occasion,
        recipient: finalAnswers.recipient,
        style: finalAnswers.style,
      });
      const res = await fetch(`/api/gift-finder?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      // fail-open: best-effort
      setError(t.errorMessage);
      setResults([]);
    } finally {
      setLoading(false);
      setShowResults(true);
    }
  };

  const retryFetch = () => {
    if (lastAnswers) {
      setShowResults(false);
      setError(null);
      void fetchResults(lastAnswers);
    }
  };

  const handleSelect = (value: string) => {
    const step = steps[currentStep];
    const newAnswers = { ...answers, [step!.id]: value };
    setAnswers(newAnswers);

    if (currentStep < steps.length - 1) {
      setAnimatingStep(true);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setAnimatingStep(false);
      }, 200);
    } else {
      void fetchResults(newAnswers as Answers);
    }
  };

  const resetQuiz = () => {
    setCurrentStep(0);
    setAnswers({});
    setResults([]);
    setShowResults(false);
    setError(null);
    setLastAnswers(null);
  };

  if (loading) {
    return <ResultSkeleton language={language} />;
  }

  if (showResults) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8" aria-live="polite">
        {/* Results header */}
        <div className="mb-12 animate-[fadeIn_0.5s_ease-out] text-center">
          <p
            className="mb-2 text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--color-accent)" }}
          >
            {t.yourResults}
          </p>
          <h1
            className="mb-4 text-3xl font-bold md:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            {t.perfectMatches(productLabel)}
          </h1>
          <p className="text-gray-500">{t.matchesDescription(productLabelPlural)}</p>
        </div>

        {error && (
          <div
            className="mb-8 rounded-xl border border-red-200 bg-red-50 p-6 text-center"
            role="alert"
            aria-live="assertive"
          >
            <div className="mb-3">
              <svg
                className="mx-auto h-10 w-10 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <p className="mb-1 text-lg font-semibold text-red-800">{t.unableToLoad}</p>
            <p className="mb-5 text-sm text-red-600">{error}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={retryFetch}
                className="inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: "var(--color-accent)" }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {t.retry}
              </button>
              <button
                onClick={resetQuiz}
                className="rounded-full border border-red-300 px-6 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                {t.startOver}
              </button>
            </div>
          </div>
        )}

        {/* Result cards */}
        <div className="space-y-6">
          {results.map((product, i) => (
            <div
              key={product.slug}
              className={`rounded-xl border bg-white p-6 shadow-sm md:p-8 ${
                i === 0 ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200"
              }`}
              style={{ animation: `fadeSlideUp 0.4s ease-out ${i * 0.1}s both` }}
            >
              <span
                className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ${
                  i === 0 ? "bg-amber-500" : i === 1 ? "bg-gray-700" : "bg-gray-400"
                }`}
              >
                {rankLabels[i]}
              </span>

              <h2
                className="mb-2 text-xl font-semibold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {product.name}
              </h2>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                {product.score !== null && (
                  <span className="text-sm font-bold text-emerald-600">
                    {t.giftScore(product.score)}
                  </span>
                )}
                {product.price_label && (
                  <span className="text-sm text-gray-500">{product.price_label}</span>
                )}
                {product.merchant && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-500">
                    {product.merchant}
                  </span>
                )}
              </div>

              {product.description && (
                <p className="mb-5 leading-relaxed text-gray-600">{product.description}</p>
              )}

              <div className="flex flex-wrap gap-3">
                {product.redirect_url && (
                  <a
                    href={product.redirect_url}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-shadow hover:shadow-lg"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    {product.deal_text || t.viewDeal}
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 8l4 4m0 0l-4 4m4-4H3"
                      />
                    </svg>
                  </a>
                )}
                {product.review_url && (
                  <Link
                    href={product.review_url}
                    className="inline-flex items-center rounded-full border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    {t.readFullReview}
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {!error && results.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="mb-2 text-lg font-semibold text-gray-800">{t.noMatchesTitle}</p>
            <p className="mb-6 text-gray-500">{t.noMatches(productLabelPlural)}</p>
            <button
              onClick={resetQuiz}
              className="rounded-full border border-gray-300 px-8 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              {t.retakeQuiz}
            </button>
          </div>
        )}

        <div className="mt-12 space-y-4 text-center">
          <button
            onClick={resetQuiz}
            className="font-semibold transition-colors"
            style={{ color: "var(--color-accent)" }}
          >
            &larr; {t.retakeQuiz}
          </button>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <Link href="/review" className="transition-colors hover:text-gray-700">
              {t.seeAllReviews}
            </Link>
            <Link href="/comparison" className="transition-colors hover:text-gray-700">
              {t.browseComparisons}
            </Link>
          </div>
        </div>

        {/* Keyframe animations */}
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes fadeSlideUp {
            from { opacity: 0; transform: translateY(16px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  // Quiz step view
  const step = steps[currentStep];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <p
          className="mb-2 text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--color-accent)" }}
        >
          {t.quizSubtitle}
        </p>
        <h1
          className="mb-4 text-3xl font-bold md:text-4xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {t.quizTitle(productLabel)}
        </h1>
        <p className="text-gray-500">{t.quizDescription(productLabel)}</p>
      </div>

      {/* Progress bar */}
      <div
        className="mb-8 flex items-center gap-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={currentStep + 1}
        aria-label={language === "ar" ? "تقدم الاختبار" : "Quiz progress"}
      >
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${
              i <= currentStep ? "bg-amber-400" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div
        aria-live="polite"
        aria-atomic="true"
        className={`transition-all duration-200 ${animatingStep ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}
      >
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
          {t.stepOf(currentStep + 1, steps.length)}
        </p>
        <h2
          className="mb-8 text-2xl font-semibold md:text-3xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {step!.title}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {step!.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className="rounded-xl border border-gray-200 bg-white p-6 text-start shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
            >
              <span className="text-base font-medium text-gray-800">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {currentStep > 0 && (
        <button
          onClick={() => {
            setAnimatingStep(true);
            setTimeout(() => {
              setCurrentStep(currentStep - 1);
              setAnimatingStep(false);
            }, 200);
          }}
          className="mt-8 flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          {t.goBack}
        </button>
      )}
    </div>
  );
}
