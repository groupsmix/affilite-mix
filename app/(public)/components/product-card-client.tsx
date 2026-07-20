"use client";

import { useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
import { useCookieConsent } from "./cookie-consent";
import { shimmerPlaceholder } from "@/lib/image-placeholder";

/**
 * Fire-and-forget click tracking, then navigate to the affiliate URL directly.
 * Decouples tracking from navigation so tracking failures don't block the user.
 */
function fireTrackingBeacon(
  slug: string,
  sourceType: string,
  placement?: string,
  campaign?: string,
) {
  const params = new URLSearchParams();
  params.set("p", slug);
  params.set("t", sourceType);
  if (placement) params.set("pl", placement);
  if (campaign) params.set("c", campaign);
  const trackUrl = `/api/track/click?${params.toString()}`;
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(trackUrl);
    } else {
      fetch(trackUrl, { method: "GET", keepalive: true }).catch(() => {});
    }
  } catch {
    // fail-open: best-effort
    // Tracking failure should never block navigation
  }
}

interface ProductCardCtaProps {
  href: string;
  slug: string;
  sourceType?: string;
  placement?: string;
  campaign?: string;
  label: ReactNode;
  className: string;
  style?: React.CSSProperties;
}

export function ProductCardCta({
  href,
  slug,
  sourceType = "content",
  placement,
  campaign,
  label,
  className,
  style,
}: ProductCardCtaProps) {
  const { accepted: consentAccepted } = useCookieConsent();

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();

    if (consentAccepted) {
      fireTrackingBeacon(slug, sourceType, placement, campaign);
    }

    // Send a GA4 event regardless of consent so the site can attribute clicks to placements/campaigns.
    try {
      if (
        typeof window !== "undefined" &&
        "gtag" in window &&
        typeof (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag === "function"
      ) {
        (window as unknown as { gtag: (...args: unknown[]) => void }).gtag(
          "event",
          "affiliate_click",
          {
            event_category: "affiliate",
            event_label: slug,
            placement: placement ?? sourceType,
            campaign: campaign ?? "",
          },
        );
      }
    } catch {
      // fail-open: analytics best-effort
    }

    // Append UTM parameters for affiliate attribution where the URL allows it.
    let destinationUrl = href;
    try {
      const url = new URL(href, window.location.href);
      if (!url.searchParams.has("utm_source")) {
        url.searchParams.set("utm_source", window.location.host);
      }
      if (!url.searchParams.has("utm_medium")) {
        url.searchParams.set("utm_medium", "affiliate");
      }
      if (campaign && !url.searchParams.has("utm_campaign")) {
        url.searchParams.set("utm_campaign", campaign);
      } else if (!url.searchParams.has("utm_campaign") && sourceType !== "content") {
        url.searchParams.set("utm_campaign", sourceType);
      }
      destinationUrl = url.toString();
    } catch {
      // If href is not a valid absolute/relative URL, fall back to opening it as-is.
    }

    window.open(destinationUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className}
      style={style}
    >
      {label}
    </a>
  );
}

interface ProductCardImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  sizes: string;
  className: string;
  priority?: boolean;
  loading?: "eager" | "lazy";
  blurDataURL?: string;
  fallbackClassName: string;
}

export function ProductCardImage({
  src,
  alt,
  width,
  height,
  sizes,
  className,
  priority,
  loading,
  blurDataURL,
  fallbackClassName,
}: ProductCardImageProps) {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <div className={fallbackClassName}>
        <svg
          className="size-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
          />
        </svg>
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      sizes={sizes}
      placeholder="blur"
      blurDataURL={blurDataURL ?? shimmerPlaceholder(width, height)}
      className={className}
      priority={priority}
      loading={loading}
      onError={() => setImgError(true)}
    />
  );
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

interface ProductCardDealBadgeProps {
  dealText: string;
  dealExpiresAt: string | null;
}

export function ProductCardDealBadge({ dealText, dealExpiresAt }: ProductCardDealBadgeProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isDealActive(dealExpiresAt)) return null;

  const timeLeft = getDealTimeLeft(dealExpiresAt);

  return (
    <div className="absolute -top-2 start-3 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
      {dealText}
      {timeLeft && <span className="ms-1 text-red-100">· {timeLeft}</span>}
    </div>
  );
}
