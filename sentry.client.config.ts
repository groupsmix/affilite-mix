/**
 * G-05: Sentry browser SDK — gated on cookie consent.
 *
 * This file is auto-loaded by Next.js (via the `sentry` integration) on the
 * client side. It initializes @sentry/browser ONLY when the user has accepted
 * non-essential cookies. If consent is later revoked, Sentry is disabled via
 * `Sentry.close()`.
 *
 * The cookie consent banner dispatches a `cookieConsent` CustomEvent with
 * `{ detail: { accepted: boolean } }` — see
 * app/(public)/components/cookie-consent.tsx.
 */

import * as Sentry from "@sentry/browser";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";

/** Check if analytics/non-essential cookies have been accepted. */
function hasAnalyticsConsent(): boolean {
  if (typeof document === "undefined") return false;
  // Match any domain-scoped consent cookie set by cookie-consent.tsx
  const match = document.cookie.match(/nh-cookie-consent-[^=]+=([^;]*)/);
  return match?.[1] === "accepted";
}

let sentryInitialized = false;

function initSentry() {
  if (sentryInitialized || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    environment: process.env.NODE_ENV ?? "development",
    // Don't send PII
    sendDefaultPii: false,
  });
  sentryInitialized = true;
}

function teardownSentry() {
  if (!sentryInitialized) return;
  void Sentry.close(2000);
  sentryInitialized = false;
}

// Initialize immediately if consent was previously granted
if (typeof window !== "undefined") {
  if (hasAnalyticsConsent()) {
    initSentry();
  }

  // Listen for consent changes from the cookie banner
  window.addEventListener("cookieConsent", ((event: CustomEvent<{ accepted: boolean }>) => {
    if (event.detail.accepted) {
      initSentry();
    } else {
      teardownSentry();
    }
  }) as EventListener);
}
