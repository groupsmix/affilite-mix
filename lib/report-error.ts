/**
 * Client-safe error reporting for error boundaries.
 *
 * Error boundaries are client components ("use client") and cannot import
 * @sentry/cloudflare which depends on `node:async_hooks`. This module
 * provides a lightweight `reportError` function that:
 *   1. Logs to console (visible in Cloudflare's log stream)
 *   2. Uses the browser's built-in error reporting (which Sentry's
 *      browser SDK would capture if installed in the future)
 *
 * For server-side error capture, use `captureException` from `@/lib/sentry`.
 */

export function reportError(error: unknown, context?: Record<string, unknown>) {
  // Always log to console — visible in browser devtools + Cloudflare log stream
  console.error("[error-boundary]", error, context ?? "");

  // If a global error handler is registered (e.g. by a Sentry browser SDK),
  // re-dispatch so it gets captured automatically.
  if (typeof window !== "undefined" && error instanceof Error) {
    window.dispatchEvent(
      new ErrorEvent("error", { error, message: error.message }),
    );
  }
}
