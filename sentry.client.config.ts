/**
 * Sentry client-side error and performance monitoring.
 *
 * Uses @sentry/browser for real browser error capture with:
 *   - Automatic uncaught error and unhandled rejection tracking
 *   - Session replay for debugging (sampled at 10% in production)
 *   - Performance tracing for Core Web Vitals
 *   - Source map support for readable stack traces
 *
 * Requires NEXT_PUBLIC_SENTRY_DSN to be set in environment variables.
 * In local development without a DSN, Sentry is disabled silently.
 *
 * Server-side error capture is handled by @sentry/cloudflare (see lib/sentry.ts).
 */

import * as Sentry from "@sentry/browser";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (typeof window !== "undefined" && dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",

    // Sample 10% of transactions in production for performance monitoring.
    // Increase during incident investigation; decrease if quota is a concern.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Capture console.error calls as breadcrumbs for richer context.
    integrations: [
      Sentry.breadcrumbsIntegration({ console: true, dom: true, fetch: true }),
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        // Sample 50% of sessions for replay in production to balance quota
        replaySessionSampleRate: process.env.NODE_ENV === "production" ? 0.5 : 1.0,
      }),
    ],

    // Filter out noisy, non-actionable errors
    beforeSend(event) {
      const message = event.exception?.values?.[0]?.value ?? "";

      // Browser extensions and third-party scripts
      if (/ResizeObserver loop/i.test(message)) return null;
      if (/Loading chunk \d+ failed/i.test(message)) return null;

      return event;
    },
  });
}

/**
 * Capture a client-side error in Sentry with optional context.
 * Safe to call even when Sentry is not initialized (no-ops gracefully).
 */
export function captureClientError(error: unknown, context?: Record<string, string>) {
  if (typeof window !== "undefined" && dsn) {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext("extra", context);
      }
      Sentry.captureException(error);
    });
  }
  console.error("[sentry-client]", error, context ?? "");
}
