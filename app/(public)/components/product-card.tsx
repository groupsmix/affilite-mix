"use client";

import { useState } from "react";
import type { ProductRow } from "@/types/database";
import Image from "next/image";
import { useCookieConsent } from "./cookie-consent";
import { GiftWorthinessScore } from "./gift-worthiness-score";
import { shimmerPlaceholder } from "@/lib/image-placeholder";
import { highlightText } from "./highlight-text";

interface ProductCardProps {
  product: ProductRow;
  sourceType?: string;
  ctaLabel?: string;
  /** Optional link to a related review/article for this product */
  relatedContentHref?: string;
  relatedContentLabel?: string;
  /** Optional search query to highlight matching terms */
  searchQuery?: string;
}

function isDealActive(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  return new Date(expiresAt) > new Date();
}

function getDealTimeLeft(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  if (diff <= 0) return null;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 0) return `${days}d left`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours}h left`;
}

/**
 * Fire-and-forget click tracking, then navigate to the affiliate URL directly.
 * Decouples tracking from navigation so tracking failures don't block the user.
 */
function fireTrackingBeacon(slug: string, sourceType: string) {
  const trackUrl = `/api/track/click?p=${encodeURIComponent(slug)}&t=${sourceType}`;
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

export function ProductCard({ product, sourceType = "content", ctaLabel = "View Deal", relatedContentHref, relatedContentLabel, searchQuery }: ProductCardProps) {
  const { accepted: consentAccepted } = useCookieConsent();
  const [imgError, setImgError] = useState(false);
  const buttonLabel = product.cta_text || ctaLabel;
  const showDeal = product.deal_text && isDealActive(product.deal_expires_at);
  const dealTimeLeft = getDealTimeLeft(product.deal_expires_at);

  function handleCtaClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const href = e.currentTarget.getAttribute("data-href");
    if (!href) return;

    // Only track clicks when cookie consent has been accepted
    if (consentAccepted) {
      fireTrackingBeacon(product.slug, sourceType);
    }

    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="relative rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      {/* Deal badge */}
      {showDeal && (
        <div className="absolute -top-2 left-3 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
          {product.deal_text}
          {dealTimeLeft && (
            <span className="ml-1 text-red-100">· {dealTimeLeft}</span>
          )}
        </div>
      )}
      {product.image_url && !imgError && (
        <div className="mb-3 overflow-hidden rounded-md">
          <Image
            src={product.image_url}
            alt={product.image_alt || product.name}
            width={320}
            height={160}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            placeholder="blur"
            blurDataURL={shimmerPlaceholder(320, 160)}
            className="h-40 w-full object-contain"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      <h3 className="mb-1 text-lg font-semibold leading-tight">{searchQuery ? highlightText(product.name, searchQuery) : product.name}</h3>
      {product.merchant && (
        <p className="mb-1 text-sm text-gray-500">{product.merchant}</p>
      )}
      <div className="mb-3 flex items-center gap-3">
        {product.price && (
          <span className="text-lg font-bold" style={{ color: "var(--color-accent, #10B981)" }}>{product.price}</span>
        )}
        {product.score !== null && (
          <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
        )}
      </div>
      {product.affiliate_url && (
        <a
          href={product.affiliate_url}
          data-href={product.affiliate_url}
          onClick={handleCtaClick}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block w-full rounded-md px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-accent, #10B981)" }}
        >
          {buttonLabel}
        </a>
      )}
      {relatedContentHref && (
        <a
          href={relatedContentHref}
          className="mt-2 block text-center text-xs font-medium transition-colors hover:underline"
          style={{ color: "var(--color-accent, #10B981)" }}
        >
          {relatedContentLabel ?? "Read our review →"}
        </a>
      )}
    </div>
  );
}
