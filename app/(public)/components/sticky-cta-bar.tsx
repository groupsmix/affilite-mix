"use client";

import { useMemo, useState, useEffect } from "react";
import type { ProductRow } from "@/types/database";
import { useCookieConsent } from "./cookie-consent";
import { GiftWorthinessScore } from "./gift-worthiness-score";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { getTrackingUrl } from "@/lib/tracking-url";

function affiliateUrlWithUtm(
  url: string,
  sourceType: string,
  campaign?: string,
  placement?: string,
): string {
  try {
    const base = typeof window !== "undefined" ? window.location.href : undefined;
    const u = new URL(url, base);
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set(
        "utm_source",
        typeof window !== "undefined" ? window.location.host : "affiliate-site",
      );
    }
    if (!u.searchParams.has("utm_medium")) {
      u.searchParams.set("utm_medium", "affiliate");
    }
    if (!u.searchParams.has("utm_campaign")) {
      const utmCampaign =
        campaign ?? (sourceType !== "content" ? sourceType : (placement ?? "content"));
      if (utmCampaign) u.searchParams.set("utm_campaign", utmCampaign);
    }
    return u.toString();
  } catch {
    return url;
  }
}

interface StickyCtaBarProps {
  product: ProductRow;
}

export function StickyCtaBar({ product }: StickyCtaBarProps) {
  const [visible, setVisible] = useState(false);
  const { accepted: consentAccepted } = useCookieConsent();

  useEffect(() => {
    function handleScroll() {
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  if (!visible) return null;

  if (!hasUsableAffiliateUrl(product.affiliate_url)) return null;

  const destinationWithUtm = affiliateUrlWithUtm(product.affiliate_url, "sticky");
  const ctaUrl = getTrackingUrl(product.slug, "sticky", destinationWithUtm, consentAccepted, {
    productName: product.name,
  });

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-all">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{product.name}</p>
          <div className="flex items-center gap-2 text-sm">
            {product.price && (
              <span className="font-bold" style={{ color: "var(--color-accent, #10B981)" }}>
                {product.price}
              </span>
            )}
            {product.score !== null && (
              <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
            )}
          </div>
        </div>
        <a
          href={ctaUrl}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="shrink-0 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-accent, #10B981)" }}
        >
          {product.cta_text || "Get Best Deal"}
        </a>
      </div>
    </div>
  );
}
