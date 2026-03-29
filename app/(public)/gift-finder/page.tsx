"use client";

import { useState } from "react";
import Link from "next/link";

interface QuizEntry {
  name: string;
  slug: string;
  price_range: string;
  price_min: number;
  price_max: number;
  movement: string;
  style: string[];
  occasions: string[];
  recipients: string[];
  gift_score: number;
  one_liner: string;
  affiliate_url?: string;
}

/**
 * Watch database for the Gift Finder Quiz.
 * In a future iteration this could be fetched from the Supabase products table,
 * but for now we keep it inline to match the original watch-3000V behaviour.
 */
const watchDatabase: QuizEntry[] = [
  {
    name: "Seiko Presage SRPD37",
    slug: "/review/seiko-presage-srpd37",
    price_range: "$280\u2013$320",
    price_min: 280,
    price_max: 320,
    movement: "automatic",
    style: ["classic", "dress"],
    occasions: ["christmas", "fathers_day", "birthday", "valentines", "anniversary", "graduation"],
    recipients: ["husband", "dad", "boyfriend", "self"],
    gift_score: 9.2,
    one_liner: "Cocktail-inspired automatic with a color-shifting dial that photographs beautifully.",
    affiliate_url: "https://www.amazon.com/dp/B085BKTSSD?tag=wristnerd-20",
  },
  {
    name: "Orient Bambino V2",
    slug: "/review/orient-bambino-v2",
    price_range: "$130\u2013$170",
    price_min: 130,
    price_max: 170,
    movement: "automatic",
    style: ["classic", "dress"],
    occasions: ["christmas", "fathers_day", "birthday", "graduation", "other"],
    recipients: ["husband", "dad", "boyfriend", "son", "friend", "self"],
    gift_score: 9.1,
    one_liner: "The best automatic dress watch under $200 \u2014 period.",
    affiliate_url: "https://www.amazon.com/dp/B01MTS5BPY?tag=wristnerd-20",
  },
  {
    name: "Tissot PRX Powermatic 80",
    slug: "/review/tissot-prx-powermatic-80",
    price_range: "$450\u2013$500",
    price_min: 450,
    price_max: 500,
    movement: "automatic",
    style: ["modern", "sport"],
    occasions: ["christmas", "fathers_day", "birthday", "valentines", "anniversary"],
    recipients: ["husband", "boyfriend", "self"],
    gift_score: 9.3,
    one_liner: "Swiss automatic with \u201970s-inspired integrated bracelet design.",
    affiliate_url: "https://www.amazon.com/dp/B09BFJM1TZ?tag=wristnerd-20",
  },
  {
    name: "Hamilton Khaki Field Mechanical",
    slug: "/review/hamilton-khaki-field-mechanical",
    price_range: "$400\u2013$500",
    price_min: 400,
    price_max: 500,
    movement: "mechanical",
    style: ["rugged", "casual"],
    occasions: ["christmas", "fathers_day", "birthday", "graduation"],
    recipients: ["husband", "dad", "boyfriend", "son", "self"],
    gift_score: 9.0,
    one_liner: "Military heritage meets Swiss craftsmanship in a slim, hand-wound package.",
    affiliate_url: "https://www.amazon.com/dp/B07PL145R1?tag=wristnerd-20",
  },
  {
    name: "Citizen Eco-Drive BM8180",
    slug: "/review/citizen-eco-drive-bm8180",
    price_range: "$75\u2013$100",
    price_min: 75,
    price_max: 100,
    movement: "solar",
    style: ["casual", "rugged"],
    occasions: ["christmas", "fathers_day", "birthday", "other"],
    recipients: ["dad", "friend", "son", "self"],
    gift_score: 7.8,
    one_liner: "Solar-powered field watch \u2014 reliable, affordable, no-fuss daily wearer.",
    affiliate_url: "https://www.amazon.com/dp/B000EQS1JW?tag=wristnerd-20",
  },
  {
    name: "Seiko 5 Sports SRPD55",
    slug: "/review/seiko-5-srpd55",
    price_range: "$220\u2013$270",
    price_min: 220,
    price_max: 270,
    movement: "automatic",
    style: ["sport", "casual"],
    occasions: ["christmas", "fathers_day", "birthday", "graduation"],
    recipients: ["boyfriend", "son", "friend", "self"],
    gift_score: 8.4,
    one_liner: "Modern sports automatic with 100m WR and day-date complication.",
    affiliate_url: "https://www.amazon.com/dp/B07WGN2YRW?tag=wristnerd-20",
  },
  {
    name: "Casio G-Shock GA2100",
    slug: "/review/casio-g-shock-ga2100",
    price_range: "$80\u2013$110",
    price_min: 80,
    price_max: 110,
    movement: "quartz",
    style: ["sport", "rugged"],
    occasions: ["christmas", "birthday", "other"],
    recipients: ["boyfriend", "son", "friend", "self"],
    gift_score: 7.5,
    one_liner: "The \u2018CasiOak\u2019 \u2014 slim G-Shock with an AP Royal Oak-inspired octagonal bezel.",
    affiliate_url: "https://www.amazon.com/dp/B07WDKJ97R?tag=wristnerd-20",
  },
  {
    name: "Bulova Lunar Pilot",
    slug: "/review/bulova-lunar-pilot",
    price_range: "$350\u2013$450",
    price_min: 350,
    price_max: 450,
    movement: "quartz",
    style: ["sport", "classic"],
    occasions: ["christmas", "fathers_day", "birthday", "anniversary"],
    recipients: ["husband", "dad", "self"],
    gift_score: 8.6,
    one_liner: "Moon-worn chronograph heritage with UHF 262kHz precision movement.",
    affiliate_url: "https://www.amazon.com/dp/B01AJE27SM?tag=wristnerd-20",
  },
  {
    name: "Timex Marlin Automatic",
    slug: "/review/timex-marlin-automatic",
    price_range: "$200\u2013$250",
    price_min: 200,
    price_max: 250,
    movement: "automatic",
    style: ["classic", "dress"],
    occasions: ["christmas", "birthday", "graduation", "other"],
    recipients: ["boyfriend", "son", "friend", "self"],
    gift_score: 8.2,
    one_liner: "Retro-inspired automatic with exhibition caseback and mid-century styling.",
    affiliate_url: "https://www.amazon.com/dp/B0C1KLCLQ1?tag=wristnerd-20",
  },
  {
    name: "Tissot Gentleman Powermatic 80",
    slug: "/review/tissot-gentleman-powermatic-80",
    price_range: "$600\u2013$700",
    price_min: 600,
    price_max: 700,
    movement: "automatic",
    style: ["classic", "dress"],
    occasions: ["christmas", "fathers_day", "birthday", "valentines", "anniversary"],
    recipients: ["husband", "dad", "self"],
    gift_score: 9.4,
    one_liner: "Swiss automatic with sapphire crystal and finishing that rivals $2,000 watches.",
    affiliate_url: "https://www.amazon.com/dp/B07Z7D78MK?tag=wristnerd-20",
  },
  {
    name: "Fossil Neutra Chronograph",
    slug: "/review/fossil-neutra-chronograph",
    price_range: "$80\u2013$120",
    price_min: 80,
    price_max: 120,
    movement: "quartz",
    style: ["casual", "modern"],
    occasions: ["christmas", "birthday", "other"],
    recipients: ["boyfriend", "friend", "son", "self"],
    gift_score: 7.4,
    one_liner: "Minimalist fashion chronograph \u2014 clean design, decent quality, easy gift.",
    affiliate_url: "https://www.amazon.com/dp/B07B8X8TQC?tag=wristnerd-20",
  },
];

const steps = [
  {
    id: "recipient",
    title: "Who are you buying for?",
    options: [
      { value: "husband", label: "Husband" },
      { value: "dad", label: "Dad" },
      { value: "boyfriend", label: "Boyfriend" },
      { value: "son", label: "Son" },
      { value: "friend", label: "Friend" },
      { value: "self", label: "Myself" },
    ],
  },
  {
    id: "occasion",
    title: "What\u2019s the occasion?",
    options: [
      { value: "fathers_day", label: "Father\u2019s Day" },
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
    title: "What\u2019s his style?",
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

function getRecommendations(answers: Answers): QuizEntry[] {
  const maxBudget = parseInt(answers.budget, 10);
  const filtered = watchDatabase.filter((w) => w.price_max <= maxBudget);

  const scored = filtered.map((watch) => {
    let score = watch.gift_score * 10;
    if (watch.recipients.includes(answers.recipient)) score += 20;
    if (watch.occasions.includes(answers.occasion)) score += 15;
    if (watch.style.includes(answers.style)) score += 15;
    return { watch, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 3).map((s) => s.watch);
}

const rankLabels = ["Our #1 Pick", "Runner-Up", "Also Consider"] as const;

export default function GiftFinderPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Partial<Answers>>({});
  const [showResults, setShowResults] = useState(false);

  const handleSelect = (value: string) => {
    const step = steps[currentStep];
    const newAnswers = { ...answers, [step.id]: value };
    setAnswers(newAnswers);

    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      setShowResults(true);
    }
  };

  const resetQuiz = () => {
    setCurrentStep(0);
    setAnswers({});
    setShowResults(false);
  };

  if (showResults) {
    const hasAllAnswers =
      answers.recipient && answers.occasion && answers.budget && answers.style;
    const results = hasAllAnswers
      ? getRecommendations(answers as Answers)
      : [];

    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        {/* Results header */}
        <div className="mb-12 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
            Your Results
          </p>
          <h1 className="mb-4 text-3xl font-bold md:text-4xl" style={{ fontFamily: "var(--font-heading)" }}>
            Your Perfect Watch Matches
          </h1>
          <p className="text-gray-500">
            Based on your answers, here are the watches we recommend &mdash;
            sorted by Gift-Worthiness Score.
          </p>
        </div>

        {/* Result cards */}
        <div className="space-y-6">
          {results.map((watch, i) => (
            <div
              key={watch.slug}
              className={`rounded-xl border bg-white p-6 shadow-sm md:p-8 ${
                i === 0 ? "border-amber-300 ring-1 ring-amber-200" : "border-gray-200"
              }`}
            >
              <span
                className={`mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide text-white ${
                  i === 0
                    ? "bg-amber-500"
                    : i === 1
                      ? "bg-gray-700"
                      : "bg-gray-400"
                }`}
              >
                {rankLabels[i]}
              </span>

              <h2
                className="mb-2 text-xl font-semibold"
                style={{ fontFamily: "var(--font-heading)" }}
              >
                {watch.name}
              </h2>

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-emerald-600">
                  Gift Score: {watch.gift_score}/10
                </span>
                <span className="text-sm text-gray-500">{watch.price_range}</span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-500">
                  {watch.movement}
                </span>
              </div>

              <p className="mb-5 leading-relaxed text-gray-600">{watch.one_liner}</p>

              <div className="flex flex-wrap gap-3">
                {watch.affiliate_url && (
                  <a
                    href={watch.affiliate_url}
                    rel="nofollow sponsored noopener"
                    target="_blank"
                    className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-shadow hover:shadow-lg"
                    style={{ backgroundColor: "var(--color-accent)" }}
                  >
                    Check Price on Amazon
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </a>
                )}
                <Link
                  href={watch.slug}
                  className="inline-flex items-center rounded-full border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                >
                  Read Full Review
                </Link>
              </div>
            </div>
          ))}
        </div>

        {results.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <p className="mb-2 text-lg font-semibold text-gray-800">No Matches Found</p>
            <p className="mb-6 text-gray-500">
              We couldn&apos;t find watches matching all your criteria. Try
              adjusting your budget or style preference.
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
          <div className="flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            <Link href="/review" className="transition-colors hover:text-gray-700">
              See All Reviews
            </Link>
            <Link href="/comparison" className="transition-colors hover:text-gray-700">
              Browse Comparisons
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Quiz step view
  const step = steps[currentStep];

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <p className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: "var(--color-accent)" }}>
          60-Second Quiz
        </p>
        <h1
          className="mb-4 text-3xl font-bold md:text-4xl"
          style={{ fontFamily: "var(--font-heading)" }}
        >
          Watch Gift Finder Quiz
        </h1>
        <p className="text-gray-500">
          Answer 4 quick questions and get personalized watch recommendations in
          60 seconds.
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

      <p className="mb-2 text-xs font-bold uppercase tracking-widest text-gray-400">
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
            <span className="text-base font-medium text-gray-800">
              {option.label}
            </span>
          </button>
        ))}
      </div>

      {currentStep > 0 && (
        <button
          onClick={() => setCurrentStep(currentStep - 1)}
          className="mt-8 flex items-center gap-1.5 text-sm text-gray-400 transition-colors hover:text-gray-700"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Go Back
        </button>
      )}
    </div>
  );
}
