"use client";

import type { ProductRow } from "@/types/database";
import Image from "next/image";
import { useCookieConsent } from "./cookie-consent";
import { getTrackingUrl } from "@/lib/tracking-url";
import { shimmerPlaceholder } from "@/lib/image-placeholder";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";

interface TopPickBannerProps {
  product: ProductRow;
  language: string;
  lastVerified?: string | null;
  totalCompared?: number;
}

/**
 * Sticky "Our #1 Pick" banner for listicle/round-up pages.
 *
 * Shows the highest-scored product from a multi-product recommendation
 * immediately below the header, with a tracked CTA, score badge and a
 * freshness stamp. This surfaces the money action before the visitor
 * has to scroll through the full article.
 */
export function TopPickBanner({
  product,
  language,
  lastVerified,
  totalCompared,
}: TopPickBannerProps) {
  const isAr = language === "ar";
  const { accepted: hasConsent } = useCookieConsent();

  const ctaUrl = hasUsableAffiliateUrl(product.affiliate_url)
    ? getTrackingUrl(product.slug, "top-pick", product.affiliate_url, hasConsent)
    : null;

  const tier =
    product.score === null
      ? null
      : product.score >= 9
        ? { label: isAr ? "استثنائي" : "Exceptional", color: "#0C8F63" }
        : product.score >= 8
          ? { label: isAr ? "ممتاز" : "Excellent", color: "#0C8F63" }
          : product.score >= 7
            ? { label: isAr ? "رائع" : "Great", color: "#1B49C7" }
            : product.score >= 6
              ? { label: isAr ? "جيد" : "Good", color: "#1B49C7" }
              : { label: isAr ? "مقبول" : "Fair", color: "#5A6573" };

  return (
    <section
      aria-label={isAr ? "اختيارنا الأول" : "Our #1 pick"}
      className="sticky top-4 z-30 mb-8 rounded-xl border border-emerald-200 bg-white p-5 shadow-lg sm:p-6"
      style={{ borderInlineStartWidth: "4px", borderInlineStartColor: "#10B981" }}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wide text-white">
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          {isAr ? "اختيارنا الأول" : "Our #1 pick"}
        </span>
        {totalCompared && totalCompared > 1 && (
          <span className="font-mono text-xs text-gray-500">
            {isAr ? `اختبرنا ${totalCompared} خيارات` : `Tested ${totalCompared} options`}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {product.image_url && (
          <div className="shrink-0">
            <Image
              src={product.image_url}
              alt={product.image_alt || product.name}
              width={80}
              height={80}
              sizes="80px"
              placeholder="blur"
              blurDataURL={shimmerPlaceholder(80, 80)}
              className="h-20 w-20 rounded-lg border border-gray-100 object-contain"
            />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-semibold tracking-tight text-gray-900">
            {product.name}
          </h2>
          {product.merchant && (
            <p className="mt-0.5 font-mono text-xs text-gray-500">{product.merchant}</p>
          )}
          {product.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-600">
              {product.description}
            </p>
          )}
          {lastVerified && (
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-gray-400">
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

        {tier && product.score !== null && (
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-0.5">
            <div className="flex items-baseline gap-0.5">
              <span
                className="font-mono text-3xl font-bold tabular-nums leading-none"
                style={{ color: tier.color }}
              >
                {product.score.toFixed(1)}
              </span>
              <span className="font-mono text-sm text-gray-400">/10</span>
            </div>
            <span className="text-xs font-medium" style={{ color: tier.color }}>
              {tier.label}
            </span>
          </div>
        )}

        {ctaUrl && (
          <a
            href={ctaUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-lg px-6 text-center text-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{ backgroundColor: "var(--color-accent, #10B981)" }}
          >
            {product.cta_text || (isAr ? "احصل على أفضل عرض" : "Get Best Deal")}
          </a>
        )}
      </div>
    </section>
  );
}
