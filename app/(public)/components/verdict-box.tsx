"use client";

import type { ProductRow } from "@/types/database";
import Image from "next/image";
import { useCookieConsent } from "./cookie-consent";
import { getTrackingUrl } from "@/lib/tracking-url";
import { shimmerPlaceholder } from "@/lib/image-placeholder";

interface VerdictBoxProps {
  /** The subject (review) or the winning tool (comparison). */
  product: ProductRow;
  language: string;
  variant: "review" | "comparison";
  /** One-line bottom-line summary shown under the name. */
  verdict?: string | null;
  /** Comparison only: runner-up, for the score-delta methodology line. */
  runnerUp?: { name: string; score: number | null } | null;
  /** Comparison only: how many tools were compared (trust signal). */
  totalCompared?: number;
  /** Mark the image as the LCP candidate (review hero). */
  priority?: boolean;
}

/** Trust-palette score tier. 0–10 scale, matches the platform score field. */
function scoreTier(score: number): { label: string; ar: string; color: string } {
  if (score >= 9) return { label: "Exceptional", ar: "استثنائي", color: "#0C8F63" };
  if (score >= 8) return { label: "Excellent", ar: "ممتاز", color: "#0C8F63" };
  if (score >= 7) return { label: "Great", ar: "رائع", color: "#1B49C7" };
  if (score >= 6) return { label: "Good", ar: "جيد", color: "#1B49C7" };
  return { label: "Fair", ar: "مقبول", color: "#5A6573" };
}

/**
 * VerdictBox — the bottom-line-up-front answer at the top of a money page.
 *
 * Replaces the old HeroProductCta on review pages and adds an explicit winner
 * verdict to comparison pages (which previously opened on a neutral spec table
 * with no stated "who wins"). The visitor gets the verdict — winner, score,
 * price, and the action — before any scrolling.
 *
 * Consent-aware affiliate tracking is preserved via getTrackingUrl(), and the
 * tracking type matches the existing values ("hero" / "comparison") so click
 * attribution is unchanged.
 */
export function VerdictBox({
  product,
  language,
  variant,
  verdict,
  runnerUp,
  totalCompared,
  priority = false,
}: VerdictBoxProps) {
  const { accepted: hasConsent } = useCookieConsent();
  const isAr = language === "ar";
  const isComparison = variant === "comparison";

  const trackingType = isComparison ? "comparison" : "hero";
  const ctaUrl = product.affiliate_url
    ? getTrackingUrl(product.slug, trackingType, product.affiliate_url, hasConsent)
    : null;

  const tier = product.score !== null ? scoreTier(product.score) : null;

  // "Why it wins" for comparisons: prefer the top pro, fall back to description.
  const topPro = product.pros
    ? product.pros
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)[0]
    : undefined;
  const reason = verdict || (isComparison ? topPro || product.description : product.description);

  const eyebrow = isComparison ? (isAr ? "الفائز" : "Winner") : isAr ? "خلاصتنا" : "Our verdict";

  return (
    <section
      aria-label={eyebrow}
      className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white"
      style={{
        borderInlineStartWidth: "3px",
        borderInlineStartColor: isComparison ? "#10B981" : "var(--color-accent, #2D6BF0)",
      }}
    >
      <div className="p-5 sm:p-6">
        {/* Eyebrow */}
        <div className="mb-4 flex items-center gap-2">
          {isComparison ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-white">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                  clipRule="evenodd"
                />
              </svg>
              {eyebrow}
            </span>
          ) : (
            <span
              className="font-mono text-xs font-semibold uppercase tracking-[0.18em]"
              style={{ color: "var(--color-accent-text, var(--color-accent))" }}
            >
              {eyebrow}
            </span>
          )}
          {isComparison && (
            <span className="font-mono text-xs text-gray-500">
              {isAr ? "الأفضل إجمالًا" : "Best overall"}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {/* Logo / image */}
          {product.image_url && (
            <div className="shrink-0">
              <Image
                src={product.image_url}
                alt={product.image_alt || product.name}
                width={96}
                height={96}
                sizes="96px"
                priority={priority}
                placeholder="blur"
                blurDataURL={shimmerPlaceholder(96, 96)}
                className="h-24 w-24 rounded-lg border border-gray-100 object-contain"
              />
            </div>
          )}

          {/* Name + verdict line */}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-semibold tracking-tight text-gray-900">
              {product.name}
            </h2>
            {product.merchant && (
              <p className="mt-0.5 font-mono text-xs text-gray-500">{product.merchant}</p>
            )}
            {reason && (
              <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-gray-600">{reason}</p>
            )}
          </div>

          {/* Score */}
          {tier && product.score !== null && (
            <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-0.5">
              <div className="flex items-baseline gap-0.5">
                <span
                  className="font-mono text-4xl font-bold tabular-nums leading-none"
                  style={{ color: tier.color }}
                >
                  {product.score.toFixed(1)}
                </span>
                <span className="font-mono text-sm text-gray-400">/10</span>
              </div>
              <span className="text-xs font-medium" style={{ color: tier.color }}>
                {isAr ? tier.ar : tier.label}
              </span>
            </div>
          )}

          {/* Price + CTA */}
          <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
            {product.price && (
              <span className="text-center font-mono text-sm text-gray-700 sm:text-end">
                {product.price}
              </span>
            )}
            {ctaUrl && (
              <a
                href={ctaUrl}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg px-5 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ backgroundColor: "var(--color-accent, #2D6BF0)" }}
              >
                {product.cta_text || (isAr ? "جرّبها" : "Try it")}
              </a>
            )}
          </div>
        </div>

        {/* Comparison methodology line — reinforces independence */}
        {isComparison && (totalCompared || runnerUp) && (
          <p className="mt-4 border-t border-gray-100 pt-3 font-mono text-xs text-gray-500">
            {totalCompared && totalCompared > 1 && (
              <span>
                {isAr
                  ? `قارنّا ${totalCompared} أدوات بنفس المعايير`
                  : `Compared ${totalCompared} tools on the same rubric`}
              </span>
            )}
            {runnerUp && runnerUp.score !== null && (
              <span>
                {totalCompared && totalCompared > 1 ? " · " : ""}
                {isAr ? "الوصيف" : "Runner-up"}: {runnerUp.name}{" "}
                <span className="tabular-nums">{runnerUp.score.toFixed(1)}</span>
              </span>
            )}
          </p>
        )}
      </div>
    </section>
  );
}
