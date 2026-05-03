"use client";

import { useEffect, useRef } from "react";
import { useReportWebVitals } from "next/web-vitals";

/**
 * A69-F1: Check if analytics consent has been granted.
 * Reads the vanilla-cookieconsent cookie (cc_cookie) to determine if the
 * "analytics" category was accepted. Falls back to the legacy domain-scoped
 * consent cookie for backward compat.
 */
function hasAnalyticsConsent(): boolean {
  if (typeof document === "undefined") return false;
  // vanilla-cookieconsent stores accepted categories in the cc_cookie JSON.
  // Quick check: if the cookie contains "analytics" in the categories array,
  // consent was granted.
  const ccMatch = document.cookie.match(/cc_cookie=([^;]*)/);
  if (ccMatch) {
    try {
      const parsed = JSON.parse(decodeURIComponent(ccMatch[1]));
      if (Array.isArray(parsed?.categories) && parsed.categories.includes("analytics")) {
        return true;
      }
      return false;
    } catch {
      // Malformed cookie, treat as no consent
    }
  }
  // Legacy fallback: domain-scoped consent cookie from cookie-consent.tsx
  const legacyMatch = document.cookie.match(/nh-cookie-consent-[^=]+=([^;]*)/);
  return legacyMatch?.[1] === "accepted";
}

/**
 * Collects Core Web Vitals (LCP, FID, CLS, TTFB, INP) and logs them.
 * In production, these metrics can be forwarded to an analytics endpoint.
 *
 * A69-F1: Consent-before-fire -- vitals beacons are only sent when the
 * user has accepted analytics cookies. The hook still collects metrics
 * (browser-local), but the network beacon is gated on consent so we
 * comply with the ePrivacy Directive requirement for prior consent
 * before transmitting measurement data.
 *
 * Mount this component once in the root layout.
 */
export function WebVitals() {
  // A69-F1: Track consent state reactively so mid-session consent
  // changes are honoured without a page reload.
  const consentRef = useRef(false);

  useEffect(() => {
    consentRef.current = hasAnalyticsConsent();

    function onConsentChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      // vanilla-cookieconsent CMP emits { analytics: boolean, ... }
      if (detail && typeof detail.analytics === "boolean") {
        consentRef.current = detail.analytics;
      } else if (detail && typeof detail.accepted === "boolean") {
        // Legacy consent event
        consentRef.current = detail.accepted;
      }
    }

    window.addEventListener("cookieConsent", onConsentChange);
    return () => window.removeEventListener("cookieConsent", onConsentChange);
  }, []);

  useReportWebVitals((metric) => {
    // In development, log to console for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(1)}`);
    }

    // A69-F1: Only beacon in production AND when analytics consent is active.
    if (process.env.NODE_ENV === "production" && consentRef.current) {
      // Field names (`page`, `href`) match what /api/vitals reads
      // and persists to the `web_vitals` table. `navigationType` is sent
      // for completeness but is not yet stored.
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        id: metric.id,
        navigationType: metric.navigationType,
        href: location.href,
        page: location.pathname,
      });

      // Prefer sendBeacon (works during page unload), fall back to fetch
      if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
        navigator.sendBeacon("/api/vitals", body);
      } else {
        fetch("/api/vitals", {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {
          // Fire-and-forget: silently ignore failures
        });
      }
    }
  });

  return null;
}
