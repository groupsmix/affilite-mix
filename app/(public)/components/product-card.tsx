"use client";

import { useState, useEffect } from "react";
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
  /** Mark as above-the-fold for LCP optimisation */
  priority?: boolean;
  /** Card display variant. Defaults to "standard". */
  variant?: "standard" | "compact" | "detailed";
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
export function fireTrackingBeacon(slug: string, sourceType: string) {
  const trackUrl = `/api/track/click?p=${encodeURIComponent(slug)}&t=${sourceType}`;
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

export function ProductCard({
  product,
  sourceType = "content",
  ctaLabel = "View Deal",
  relatedContentHref,
  relatedContentLabel,
  searchQuery,
  priority = false,
  variant = "standard",
}: ProductCardProps) {
  const { accepted: consentAccepted } = useCookieConsent();
  const [imgError, setImgError] = useState(false);
  // B-nit: isDealActive / getDealTimeLeft call new Date() which differs between
  // SSR time and client hydration time, causing a React hydration mismatch on
  // ISR-cached pages. Guard with `mounted` so the deal badge only renders
  // client-side (safe fallback: no badge during SSR, shown after hydration).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const buttonLabel = product.cta_text || ctaLabel;
  const showDeal = mounted && product.deal_text && isDealActive(product.deal_expires_at);
  const dealTimeLeft = mounted ? getDealTimeLeft(product.deal_expires_at) : null;

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

  if (variant === "compact") {
    return (
      <div className="relative flex gap-4 rounded-lg border border-border bg-card p-3 transition-colors hover:border-accent/50">
        {showDeal && (
          <div className="absolute -top-2 start-3 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
            {product.deal_text}
            {dealTimeLeft && <span className="ms-1 text-red-100">· {dealTimeLeft}</span>}
          </div>
        )}
        {product.image_url && (
          <div className="shrink-0 overflow-hidden rounded-md">
            {imgError ? (
              <div className="flex size-20 items-center justify-center bg-muted text-muted-foreground">
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
            ) : (
              <Image
                src={product.image_url}
                alt={product.image_alt || product.name}
                width={80}
                height={80}
                sizes="80px"
                placeholder="blur"
                blurDataURL={shimmerPlaceholder(80, 80)}
                className="size-20 object-contain"
                priority={priority}
                loading={priority ? "eager" : "lazy"}
                onError={() => setImgError(true)}
              />
            )}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-tight text-card-foreground">
            {searchQuery ? highlightText(product.name, searchQuery) : product.name}
          </h3>
          {product.merchant && <p className="text-xs text-muted-foreground">{product.merchant}</p>}
          <div className="mt-1 flex items-center gap-2">
            {product.price && (
              <span className="text-sm font-bold text-[var(--color-accent-text)] dark:text-[var(--color-accent)]">
                {product.price}
              </span>
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
              className="mt-2 inline-block rounded px-3 py-1 text-xs font-medium text-[var(--color-accent-text-foreground)] transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent-text, #10B981)" }}
            >
              {buttonLabel}
            </a>
          )}
        </div>
      </div>
    );
  }

  if (variant === "detailed") {
    const prosArr = product.pros
      ? product.pros
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const consArr = product.cons
      ? product.cons
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    return (
      <div className="relative overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-accent/50">
        {showDeal && (
          <div className="absolute -top-2 start-3 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
            {product.deal_text}
            {dealTimeLeft && <span className="ms-1 text-red-100">· {dealTimeLeft}</span>}
          </div>
        )}
        {product.image_url && (
          <div className="overflow-hidden">
            {imgError ? (
              <div className="flex h-48 w-full items-center justify-center bg-muted text-muted-foreground">
                <svg
                  className="size-10"
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
            ) : (
              <Image
                src={product.image_url}
                alt={product.image_alt || product.name}
                width={400}
                height={200}
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                placeholder="blur"
                blurDataURL={shimmerPlaceholder(400, 200)}
                className="h-48 w-full object-contain"
                priority={priority}
                loading={priority ? "eager" : "lazy"}
                onError={() => setImgError(true)}
              />
            )}
          </div>
        )}
        <div className="p-4">
          <h3 className="mb-1 text-lg font-semibold leading-tight text-card-foreground">
            {searchQuery ? highlightText(product.name, searchQuery) : product.name}
          </h3>
          {product.merchant && (
            <p className="mb-1 text-sm text-muted-foreground">{product.merchant}</p>
          )}
          {product.description && (
            <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
          )}
          <div className="mb-3 flex items-center gap-3">
            {product.price && (
              <span className="text-lg font-bold text-[var(--color-accent-text)] dark:text-[var(--color-accent)]">
                {product.price}
              </span>
            )}
            {product.score !== null && (
              <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
            )}
          </div>

          {/* Pros/Cons inline */}
          {(prosArr.length > 0 || consArr.length > 0) && (
            <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
              {prosArr.length > 0 && (
                <ul className="space-y-0.5">
                  {prosArr.slice(0, 3).map((pro) => (
                    <li
                      key={pro}
                      className="flex items-start gap-1 text-emerald-600 dark:text-emerald-400"
                    >
                      <svg
                        className="mt-0.5 size-3 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{pro}</span>
                    </li>
                  ))}
                </ul>
              )}
              {consArr.length > 0 && (
                <ul className="space-y-0.5">
                  {consArr.slice(0, 3).map((con) => (
                    <li key={con} className="flex items-start gap-1 text-red-600 dark:text-red-400">
                      <svg
                        className="mt-0.5 size-3 shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {product.affiliate_url && (
            <a
              href={product.affiliate_url}
              data-href={product.affiliate_url}
              onClick={handleCtaClick}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="block w-full rounded-md px-4 py-2.5 text-center text-sm font-medium text-[var(--color-accent-text-foreground)] transition-colors hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent-text, #10B981)" }}
            >
              {buttonLabel}
            </a>
          )}
          {relatedContentHref && (
            <a
              href={relatedContentHref}
              className="mt-2 block text-center text-xs font-medium text-[var(--color-accent-text)] transition-colors hover:underline dark:text-[var(--color-accent)]"
            >
              {relatedContentLabel ?? "Read our review →"}
            </a>
          )}
        </div>
      </div>
    );
  }

  // Standard variant (default)
  return (
    <div className="relative rounded-lg border border-border bg-card p-4 transition-colors hover:border-accent/50">
      {/* Deal badge */}
      {showDeal && (
        <div className="absolute -top-2 start-3 z-10 flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white shadow-sm">
          {product.deal_text}
          {dealTimeLeft && <span className="ms-1 text-red-100">· {dealTimeLeft}</span>}
        </div>
      )}
      {product.image_url && (
        <div className="mb-3 overflow-hidden rounded-md">
          {imgError ? (
            <div className="flex h-40 w-full items-center justify-center bg-muted text-muted-foreground">
              <svg
                className="h-10 w-10"
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
          ) : (
            <Image
              src={product.image_url}
              alt={product.image_alt || product.name}
              width={320}
              height={160}
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              placeholder="blur"
              blurDataURL={shimmerPlaceholder(320, 160)}
              className="h-40 w-full object-contain"
              priority={priority}
              loading={priority ? "eager" : "lazy"}
              onError={() => setImgError(true)}
            />
          )}
        </div>
      )}
      <h3 className="mb-1 text-lg font-semibold leading-tight text-card-foreground">
        {searchQuery ? highlightText(product.name, searchQuery) : product.name}
      </h3>
      {product.merchant && <p className="mb-1 text-sm text-muted-foreground">{product.merchant}</p>}
      <div className="mb-3 flex items-center gap-3">
        {product.price && (
          <span className="text-lg font-bold text-[var(--color-accent-text)] dark:text-[var(--color-accent)]">
            {product.price}
          </span>
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
          className="block w-full rounded-md px-4 py-2 text-center text-sm font-medium text-[var(--color-accent-text-foreground)] transition-colors hover:opacity-90"
          style={{ backgroundColor: "var(--color-accent-text, #10B981)" }}
        >
          {buttonLabel}
        </a>
      )}
      {relatedContentHref && (
        <a
          href={relatedContentHref}
          className="mt-2 block text-center text-xs font-medium text-[var(--color-accent-text)] transition-colors hover:underline dark:text-[var(--color-accent)]"
        >
          {relatedContentLabel ?? "Read our review →"}
        </a>
      )}
    </div>
  );
}
