/**
 * Sentry client-side (browser) error capture configuration.
 *
 * Uses @sentry/browser to send uncaught errors and unhandled promise
 * rejections directly to Sentry from the browser.  This complements the
 * server-side @sentry/cloudflare integration (see lib/sentry.ts).
 *
 * The SDK is only initialized when NEXT_PUBLIC_SENTRY_DSN is set.
 */

import * as SentryBrowser from "@sentry/browser";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (typeof window !== "undefined" && dsn) {
  SentryBrowser.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",

    // Only send 20 % of transactions to avoid quota exhaustion on free tiers.
    tracesSampleRate: 0.2,

    // Filter out noisy browser extension errors
    beforeSend(event) {
      const frames = event.exception?.values?.[0]?.stacktrace?.frames;
      if (frames?.some((f) => f.filename?.includes("extensions/"))) {
        return null;
      }
      return event;
    },
  });
}
