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
    if (process.env.NODE_ENV === "production" && typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const body = JSON.stringify({
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        id: metric.id,
        navigationType: metric.navigationType,
      });
      navigator.sendBeacon("/api/vitals", body);
    }
  });

  return null;
}
