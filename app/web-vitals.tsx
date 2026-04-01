"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Collects Core Web Vitals (LCP, FID, CLS, TTFB, INP) and logs them.
 * In production, these metrics can be forwarded to an analytics endpoint.
 *
 * Mount this component once in the root layout.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    // In development, log to console for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(`[Web Vitals] ${metric.name}: ${metric.value.toFixed(1)}`);
    }

    // In production, send to analytics endpoint (fire-and-forget)
    if (process.env.NODE_ENV === "production") {
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        id: metric.id,
        navigationType: metric.navigationType,
        url: location.href,
        path: location.pathname,
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
