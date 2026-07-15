"use client";

import type { ProductRow } from "@/types/database";
import Image from "next/image";
import { useCookieConsent } from "./cookie-consent";
import { getTrackingUrl } from "@/lib/tracking-url";
import { shimmerPlaceholder } from "@/lib/image-placeholder";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";

interface VerdictBoxProps {
  /** The subject (review) or the winning tool (comparison). */
  product: ProductRow;
  language: string;
  variant: "review" | "comparison";
  /** One-line bottom-line summary shown under the name. */
  verdict?: string | null;
  /** Comparison only: runner-up, for the score-delta methodology line. */
  runnerUp?: { name: string; score: number | null } | null;
  /**
   * Comparison only: the full runner-up product. When present, the box renders
   * a dual "Pick A if… / Pick B if…" decision with a second tracked CTA for the
   * runner-up — turning a single-winner verdict into a genuine two-way choice.
   */
  runnerUpProduct?: ProductRow | null;
  /** Comparison only: how many items were compared (trust signal). */
  totalCompared?: number;
  /**
   * Plural product noun for this site (e.g. "Watches"), used in the
   * comparison methodology line so it reads "Compared 3 watches" instead of
   * the generic "tools". Defaults to "products" when omitted.
   */
  productLabelPlural?: string;
  /** Pre-formatted "last verified" date (freshness/trust signal). */
  lastVerified?: string | null;
  /** Mark the image as the LCP candidate (review hero). */
  priority?: boolean;
}

/**
 * The "Pick X if…" reason for a tool: prefer its strongest pro, else fall back
 * to the first sentence of its description. Grounded in existing product data —
 * no hallucinated copy.
 */
function pickReason(product: ProductRow): string {
  const topPro = product.pros
    ? product.pros
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)[0]
    : undefined;
  if (topPro) return topPro;
  const desc = (product.description || "").trim();
  return desc.split(/(?<=[.!?])\s/)[0] || desc;
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
  runnerUpProduct,
  totalCompared,
  productLabelPlural,
  lastVerified,
  priority = false,
}: VerdictBoxProps) {
  const { accepted: hasConsent } = useCookieConsent();
  const isAr = language === "ar";
  const isComparison = variant === "comparison";
  const pluralNoun = (productLabelPlural || "products").toLowerCase();

  const trackingType = isComparison ? "comparison" : "hero";
  const ctaUrl = hasUsableAffiliateUrl(product.affiliate_url)
    ? getTrackingUrl(product.slug, trackingType, product.affiliate_url, hasConsent)
    : null;

  // Second tracked CTA for the runner-up. Same "comparison" tracking type — the
  // product slug (p=…) is what attributes the click, so EPC stays correct.
  const runnerUpCtaUrl =
    isComparison && runnerUpProduct && hasUsableAffiliateUrl(runnerUpProduct.affiliate_url)
      ? getTrackingUrl(
          runnerUpProduct.slug,
          "comparison",
          runnerUpProduct.affiliate_url,
          hasConsent,
        )
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

        {/* Two-way decision — "Pick A if… / Pick B if…" with a second tracked
            CTA for the runner-up, so the page offers a real choice instead of a
            single winner. */}
        {isComparison && runnerUpProduct && (
          <div className="mt-5 grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                {isAr ? `اختر ${product.name} إن كنت تريد` : `Pick ${product.name} if`}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{pickReason(product)}</p>
            </div>
            <div className="sm:border-l sm:border-gray-100 sm:pl-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {isAr
                  ? `اختر ${runnerUpProduct.name} إن كنت تريد`
                  : `Pick ${runnerUpProduct.name} if`}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">
                {pickReason(runnerUpProduct)}
              </p>
              {runnerUpCtaUrl && (
                <a
                  href={runnerUpCtaUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-lg border px-4 text-sm font-semibold transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2"
                  style={{
                    borderColor: "var(--color-accent, #2D6BF0)",
                    color: "var(--color-accent-text, var(--color-accent))",
                  }}
                >
                  {runnerUpProduct.cta_text ||
                    (isAr ? `جرّب ${runnerUpProduct.name}` : `Try ${runnerUpProduct.name}`)}
                </a>
              )}
            </div>
          </div>
        )}

        {/* Comparison methodology line — reinforces independence */}
        {isComparison && (totalCompared || runnerUp) && (
          <p className="mt-4 border-t border-gray-100 pt-3 font-mono text-xs text-gray-500">
            {totalCompared && totalCompared > 1 && (
              <span>
                {isAr
                  ? `قارنّا ${totalCompared} ${pluralNoun} بنفس المعايير`
                  : `Compared ${totalCompared} ${pluralNoun} on the same rubric`}
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

        {/* Freshness stamp — a visible "last verified" date builds trust and
            is what LLM answer engines prefer to cite. */}
        {lastVerified && (
          <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-gray-400">
            <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .27.144.518.378.651l3 1.714a.75.75 0 00.744-1.302l-2.622-1.498V5z"
                clipRule="evenodd"
              />
            </svg>
            {isAr ? `آخر تحقّق: ${lastVerified}` : `Last verified ${lastVerified}`}
          </p>
        )}
      </div>
    </section>
  );
}
