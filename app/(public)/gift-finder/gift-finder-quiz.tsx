"use client";

import { useState } from "react";
import Link from "next/link";

function ResultSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
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
      <p className="mt-8 text-center text-sm text-gray-500">Finding your perfect matches...</p>
    </div>
  );
}

interface GiftFinderResult {
  name: string;
  slug: string;
  price: string;
  price_amount: number | null;
  price_currency: string;
  score: number | null;
  affiliate_url: string;
  image_url: string;
  description: string;
  merchant: string;
  deal_text: string;
}

interface GiftFinderQuizProps {
  productLabel: string;
  productLabelPlural: string;
}

const steps = [
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
];

interface Answers {
  recipient: string;
  occasion: string;
  budget: string;
  style: string;
}

const rankLabels = ["Our #1 Pick", "Runner-Up", "Also Consider"] as const;

function fireTrackingBeacon(slug: string) {
  const trackUrl = `/api/track/click?p=${encodeURIComponent(slug)}&t=gift-finder`;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(trackUrl);
    } else {
      fetch(trackUrl, { method: "GET", keepalive: true }).catch(() => {});
    }
  } catch {
    // Tracking failure should never block navigation
  }
}

export function GiftFinderQuiz({ productLabel, productLabelPlural }: GiftFinderQuizProps) {
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
      setError("Something went wrong while fetching recommendations. Please try again.");
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
      fetchResults(lastAnswers);
    }
  };

  const handleSelect = (value: string) => {
    const step = steps[currentStep];
    const newAnswers = { ...answers, [step.id]: value };
    setAnswers(newAnswers);

    if (currentStep < steps.length - 1) {
      setAnimatingStep(true);
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        setAnimatingStep(false);
      }, 200);
    } else {
      fetchResults(newAnswers as Answers);
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

  const handleCtaClick = (e: React.MouseEvent<HTMLAnchorElement>, product: GiftFinderResult) => {
    e.preventDefault();
    if (product.slug) {
      fireTrackingBeacon(product.slug);
    }
    if (product.affiliate_url) {
      window.open(product.affiliate_url, "_blank", "noopener,noreferrer");
    }
  };

  if (loading) {
    return <ResultSkeleton />;
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
            Your Results
          </p>
          <h1
            className="mb-4 text-3xl font-bold md:text-4xl"
            style={{ fontFamily: "var(--font-heading)" }}
          >
            Your Perfect {productLabel} Matches
          </h1>
          <p className="text-gray-500">
            Based on your answers, here are the {productLabelPlural.toLowerCase()} we recommend
            &mdash; sorted by Gift-Worthiness Score.
          </p>
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
            <p className="mb-1 text-lg font-semibold text-red-800">
              Unable to Load Recommendations
            </p>
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
                Retry
              </button>
              <button
                onClick={resetQuiz}
                className="rounded-full border border-red-300 px-6 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100"
              >
                Start Over
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
                    Gift Score: {product.score}/10
                  </span>
                )}
                {product.price && <span className="text-sm text-gray-500">{product.price}</span>}
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
                {product.affiliate_url && (
                  <a
                    href={product.affiliate_url}
                    onClick={(e) => handleCtaClick(e, product)}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-shadow hover:shadow-lg"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    {product.deal_text || "View Deal"}
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
                {product.slug && (
                  <Link
                    href={product.slug.startsWith("/") ? product.slug : `/${product.slug}`}
                    className="inline-flex items-center rounded-full border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    Read Full Review
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>

        {!error && results.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="mb-2 text-lg font-semibold text-gray-800">No Matches Found</p>
            <p className="mb-6 text-gray-500">
              We couldn&apos;t find {productLabelPlural.toLowerCase()} matching all your criteria.
              Try adjusting your budget or style preference.
            </p>
            <button
              onClick={resetQuiz}
              className="rounded-full border border-gray-300 px-8 py-3 font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              Retake the Quiz
            </button>
          </div>
        )}

        <div className="mt-12 space-y-4 text-center">
          <button
            onClick={resetQuiz}
            className="font-semibold transition-colors"
            style={{ color: "var(--color-accent)" }}
          >
            &larr; Retake the Quiz
          </button>
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <Link href="/review" className="transition-colors hover:text-gray-700">
              See All Reviews
            </Link>
            <Link href="/comparison" className="transition-colors hover:text-gray-700">
              Browse Comparisons
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
          60-Second Quiz
        </p>
        <h1
          className="mb-4 text-3xl font-bold md:text-4xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {productLabel} Gift Finder Quiz
        </h1>
        <p className="text-gray-500">
          Answer 4 quick questions and get personalized {productLabel.toLowerCase()} recommendations
          in 60 seconds.
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-8 flex items-center gap-2">
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
        className={`transition-all duration-200 ${animatingStep ? "translate-y-2 opacity-0" : "translate-y-0 opacity-100"}`}
      >
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-500">
          Step {currentStep + 1} of {steps.length}
        </p>
        <h2
          className="mb-8 text-2xl font-semibold md:text-3xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          {step.title}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {step.options.map((option) => (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className="rounded-xl border border-gray-200 bg-white p-6 text-left shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
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
          Go Back
        </button>
      )}
    </div>
  );
}
