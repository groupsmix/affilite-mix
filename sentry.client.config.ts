/**
 * Sentry browser-side error monitoring.
 *
 * Initializes @sentry/browser when NEXT_PUBLIC_SENTRY_DSN is set.
 * Server-side monitoring uses @sentry/cloudflare (see lib/sentry.ts).
 *
 * This module is imported as a side-effect by app/sentry-browser-init.tsx
 * which is mounted in the root layout.
 */

import * as Sentry from "@sentry/browser";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (typeof window !== "undefined" && dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,

    // Capture 100 % of errors, sample 10 % of transactions (tune in production)
    sampleRate: 1.0,
    tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? "0.1"),

    // Only send events from our own domain (ignore third-party script noise)
    allowUrls: [/https?:\/\/[^/]*\.(wristnerd|arabictools|cryptotools|groupsmix)\./],

    // Strip PII from error reports
    sendDefaultPii: false,

    integrations: [
      Sentry.breadcrumbsIntegration({
        console: false, // avoid noisy console breadcrumbs
      }),
      Sentry.globalHandlersIntegration({
        onerror: true,
        onunhandledrejection: true,
      }),
    ],

    beforeSend(event) {
      // Drop ResizeObserver errors — browser noise, not actionable
      if (event.exception?.values?.[0]?.value?.includes("ResizeObserver")) {
        return null;
      }
      return event;
    },
  });
}

export { Sentry };
