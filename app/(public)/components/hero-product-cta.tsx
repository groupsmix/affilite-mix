"use client";

import type { ProductRow } from "@/types/database";
import { useCookieConsent } from "./cookie-consent";
import { getTrackingUrl } from "@/lib/tracking-url";
import { GiftWorthinessScore } from "./gift-worthiness-score";
import Image from "next/image";
import { shimmerPlaceholder } from "@/lib/image-placeholder";

interface HeroProductCtaProps {
  product: ProductRow;
  language: string;
}

/**
 * Consent-aware hero product CTA for review pages.
 * Uses useCookieConsent() to conditionally track clicks,
 * matching the pattern used by ProductCard and ComparisonTable.
 */
export function HeroProductCta({ product, language }: HeroProductCtaProps) {
  const { accepted: hasConsent } = useCookieConsent();

  const ctaUrl = product.affiliate_url
    ? getTrackingUrl(product.slug, "hero", product.affiliate_url, hasConsent)
    : null;

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {product.image_url && (
          <div className="shrink-0">
            <Image
              src={product.image_url}
              alt={product.image_alt || product.name}
              width={112}
              height={112}
              sizes="112px"
              placeholder="blur"
              blurDataURL={shimmerPlaceholder(112, 112)}
              className="h-28 w-28 rounded-lg object-contain"
            />
          </div>
        )}
        <div className="flex-1">
          <h2 className="text-xl font-bold">{product.name}</h2>
          {product.merchant && (
            <p className="text-sm text-gray-500">{product.merchant}</p>
          )}
          <div className="mt-2 flex items-center gap-3">
            {product.price && (
              <span className="text-xl font-bold" style={{ color: "var(--color-accent, #10B981)" }}>{product.price}</span>
            )}
            {product.score !== null && (
              <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
            )}
          </div>
        </div>
        {ctaUrl && (
          <a
            href={ctaUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-block rounded-lg px-6 py-3 text-center font-medium text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "var(--color-accent, #10B981)" }}
          >
            {product.cta_text || (language === "ar" ? "احصل على العرض" : "Get This Deal")}
          </a>
        )}
      </div>
    </div>
  );
}
