/**
 * Client-safe error reporting for error boundaries.
 *
 * Error boundaries are client components ("use client") and cannot import
 * @sentry/cloudflare which depends on `node:async_hooks`. This module
 * provides a lightweight `reportError` function that forwards errors to
 * the @sentry/browser SDK (initialized in sentry.client.config.ts).
 *
 * For server-side error capture, use `captureException` from `@/lib/sentry`.
 */

import * as Sentry from "@sentry/browser";

export function reportError(error: unknown, context?: Record<string, unknown>) {
  // Always log to console — visible in browser devtools + Cloudflare log stream
  console.error("[error-boundary]", error, context ?? "");

  // Forward to Sentry browser SDK if initialized
  if (typeof window !== "undefined") {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext("errorBoundary", context);
      }
      Sentry.captureException(error);
    });
  }
}
