"use client";

import { useState, useEffect } from "react";
import type { ProductRow } from "@/types/database";
import { getCookieValue } from "@/lib/cookie-utils";
import { useCookieConsent } from "./cookie-consent";
import { GiftWorthinessScore } from "./gift-worthiness-score";

interface StickyCtaBarProps {
  product: ProductRow;
}

export function StickyCtaBar({ product }: StickyCtaBarProps) {
  const [visible, setVisible] = useState(false);
  const [cookieConsentResolved, setCookieConsentResolved] = useState(false);
  const { accepted: consentAccepted } = useCookieConsent();

  useEffect(() => {
    // Check if cookie consent has been resolved
    const consent = getCookieValue("nh-cookie-consent");
    setCookieConsentResolved(consent === "accepted" || consent === "rejected");

    function handleConsentChange() {
      const updatedConsent = getCookieValue("nh-cookie-consent");
      setCookieConsentResolved(updatedConsent === "accepted" || updatedConsent === "rejected");
    }
    window.addEventListener("cookieConsent", handleConsentChange);

    function handleScroll() {
      // Show sticky bar after scrolling 400px
      setVisible(window.scrollY > 400);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("cookieConsent", handleConsentChange);
    };
  }, []);

  if (!visible) return null;

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    // Only track clicks when cookie consent has been accepted
    if (consentAccepted) {
      const trackUrl = `/api/track/click?p=${encodeURIComponent(product.slug)}&t=sticky`;
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
    if (product.affiliate_url) {
      window.open(product.affiliate_url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className={`fixed left-0 right-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur transition-all ${cookieConsentResolved ? "bottom-0" : "bottom-[140px] sm:bottom-[100px]"}`}>
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-gray-900">{product.name}</p>
          <div className="flex items-center gap-2 text-sm">
            {product.price && (
              <span className="font-bold" style={{ color: "var(--color-accent, #10B981)" }}>{product.price}</span>
            )}
            {product.score !== null && (
              <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
            )}
          </div>
        </div>
        <a
          href={product.affiliate_url || "#"}
          onClick={handleClick}
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
