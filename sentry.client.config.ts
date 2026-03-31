/**
 * Sentry client-side error capture configuration.
 *
 * This project uses @sentry/cloudflare for server-side error monitoring,
 * which does not expose a browser-compatible `init()`. Instead, this module
 * sets up global error listeners that forward uncaught errors and unhandled
 * promise rejections to the console, where Cloudflare's built-in log stream
 * and any future browser-side Sentry SDK can capture them.
 *
 * The listeners are only active when NEXT_PUBLIC_SENTRY_DSN is set,
 * indicating that Sentry is configured for the project.
 *
 * Server-side error capture is handled by @sentry/cloudflare (see lib/sentry.ts).
 */

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (typeof window !== "undefined" && dsn) {
  // Capture unhandled errors
  window.addEventListener("error", (event) => {
    if (event.error) {
      console.error("[sentry-client] Uncaught error:", event.error);
    }
  });

  // Capture unhandled promise rejections
  window.addEventListener("unhandledrejection", (event) => {
    console.error("[sentry-client] Unhandled rejection:", event.reason);
  });
}
