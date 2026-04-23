"use client";

import { useState, type FormEvent } from "react";

interface QuizOption {
  value: string;
  label: string;
  icon?: string;
}

interface QuizStep {
  id: string;
  question: string;
  type: "single" | "multiple" | "range" | "text";
  options?: QuizOption[];
  range?: { min: number; max: number; step: number; unit?: string };
  required?: boolean;
}

interface QuizProduct {
  id: string;
  name: string;
  slug: string;
  image_url: string;
  price: string;
  price_amount: number | null;
  price_currency: string;
  score: number | null;
  affiliate_url: string;
  merchant: string;
  cta_text: string;
}

interface QuizFunnelProps {
  slug: string;
  title: string;
  description?: string;
  steps: QuizStep[];
  gateEmail: boolean;
  maxResults: number;
}

/**
 * Multi-step quiz funnel component.
 * Renders a wizard-style form with progress bar, branching answers,
 * email gate before results, and product recommendations.
 *
 * Converts 15-30% of visitors to email (vs 1-3% for footer signup).
 */
export function QuizFunnel({ slug, title, description, steps, gateEmail }: QuizFunnelProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[] | number>>({});
  const [email, setEmail] = useState("");
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [products, setProducts] = useState<QuizProduct[]>([]);
  const [phase, setPhase] = useState<"quiz" | "email_gate" | "results" | "loading">("quiz");
  const [error, setError] = useState<string | null>(null);

  const step = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  function setAnswer(stepId: string, value: string | string[] | number) {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
  }

  function handleSingleSelect(value: string) {
    setAnswer(step.id, value);
    // Auto-advance on single select
    if (currentStep < steps.length - 1) {
      setTimeout(() => setCurrentStep((s) => s + 1), 200);
    } else {
      void submitQuiz({ ...answers, [step.id]: value });
    }
  }

  function handleMultiSelect(value: string) {
    const current = (answers[step.id] as string[]) || [];
    const updated = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setAnswer(step.id, updated);
  }

  async function submitQuiz(finalAnswers?: Record<string, string | string[] | number>) {
    setPhase("loading");
    setError(null);

    try {
      const res = await fetch(`/api/quiz/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submission_id: submissionId,
          answers: finalAnswers || answers,
          email: email || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        setPhase("quiz");
        return;
      }

      setSubmissionId(data.submission_id);

      if (data.status === "awaiting_email") {
        setPhase("email_gate");
      } else {
        setProducts(data.products || []);
        setPhase("results");
      }
    } catch {
      setError("Network error. Please try again.");
      setPhase("quiz");
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    await submitQuiz();
  }

  // ── Loading ────────────────────────────────────────

  if (phase === "loading") {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-12 text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
        <p className="text-gray-600">Finding your perfect matches...</p>
      </div>
    );
  }

  // ── Email gate ────────────────────────────────────────

  if (phase === "email_gate") {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-12">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Your results are ready!</h2>
          <p className="mt-2 text-gray-600">
            Enter your email to unlock your personalized recommendations.
          </p>
        </div>
        <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-4">
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-center text-lg focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <input
              type="checkbox"
              id="email-consent"
              required
              className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300"
            />
            <label htmlFor="email-consent" className="text-sm text-gray-600">
              <strong>We'll email you your results.</strong> We'll also send you product updates and recommendations. You can unsubscribe anytime.
            </label>
          </div>
          <button
            type="submit"
            className="w-full rounded-lg bg-blue-600 px-6 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-700"
          >
            Show My Results
          </button>
          <p className="text-center text-xs text-gray-400">Free. No spam. Unsubscribe anytime.</p>
        </form>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────

  if (phase === "results") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900">Your Top Picks</h2>
          <p className="mt-1 text-gray-600">
            Based on your preferences, here are our recommendations.
          </p>
        </div>

        {products.length === 0 ? (
          <p className="text-center text-gray-500">
            No exact matches found. Try broadening your preferences.
          </p>
        ) : (
          <div className="space-y-4">
            {products.map((product, i) => (
              <div
                key={product.id}
                className="flex items-center gap-4 rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                  {i + 1}
                </div>
                {product.image_url && (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="h-20 w-20 rounded-md object-cover"
                  />
                )}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">{product.name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
                    {product.merchant && <span>{product.merchant}</span>}
                    {product.score !== null && <span>Score: {product.score}/10</span>}
                    {product.price && (
                      <span className="font-medium text-gray-900">{product.price}</span>
                    )}
                  </div>
                </div>
                {product.affiliate_url && (
                  <a
                    href={`/r/${product.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    {product.cta_text || "Check Price"}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Quiz steps ────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-6 py-8">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-gray-600">{description}</p>}
      </div>

      {/* Progress bar */}
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-center text-xs text-gray-400">
        Step {currentStep + 1} of {steps.length}
      </p>

      {/* Question */}
      {step && (
        <div className="space-y-4">
          <h3 className="text-center text-lg font-medium text-gray-800">{step.question}</h3>

          {/* Single select */}
          {step.type === "single" && step.options && (
            <div className="grid grid-cols-2 gap-3">
              {step.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSingleSelect(opt.value)}
                  className={`rounded-lg border-2 px-4 py-3 text-sm font-medium transition-all ${
                    answers[step.id] === opt.value
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {opt.icon && <span className="mr-2">{opt.icon}</span>}
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* Multiple select */}
          {step.type === "multiple" && step.options && (
            <div className="space-y-2">
              {step.options.map((opt) => {
                const selected = ((answers[step.id] as string[]) || []).includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleMultiSelect(opt.value)}
                    className={`w-full rounded-lg border-2 px-4 py-3 text-left text-sm font-medium transition-all ${
                      selected
                        ? "border-blue-500 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Range slider */}
          {step.type === "range" && step.range && (
            <div className="space-y-2">
              <input
                type="range"
                min={step.range.min}
                max={step.range.max}
                step={step.range.step}
                value={(answers[step.id] as number) || step.range.min}
                onChange={(e) => setAnswer(step.id, Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-sm text-gray-500">
                <span>
                  {step.range.unit}
                  {step.range.min}
                </span>
                <span className="font-medium text-gray-900">
                  {step.range.unit}
                  {(answers[step.id] as number) || step.range.min}
                </span>
                <span>
                  {step.range.unit}
                  {step.range.max}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-center text-sm text-red-600">{error}</p>}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0}
          className="rounded-md px-4 py-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-30"
        >
          Back
        </button>

        {step?.type !== "single" && (
          <button
            type="button"
            onClick={() => {
              if (currentStep < steps.length - 1) {
                setCurrentStep((s) => s + 1);
              } else {
                void submitQuiz();
              }
            }}
            className="rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            {currentStep < steps.length - 1
              ? "Next"
              : gateEmail
                ? "See Results"
                : "Get Recommendations"}
          </button>
        )}
      </div>
    </div>
  );
}
