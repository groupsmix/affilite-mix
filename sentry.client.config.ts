/**
 * G-05: Sentry browser SDK, gated on cookie consent.
 *
 * This file is auto-loaded by Next.js on the client side. It initializes
 * @sentry/browser only when the user has accepted the analytics cookie category.
 * If analytics consent is later revoked, Sentry is disabled via `Sentry.close()`.
 *
 * Consent is managed by `CookieConsentCmp`, which uses vanilla-cookieconsent.
 * That CMP stores choices in `cc_cookie` as JSON with a `categories` array and
 * dispatches a `cookieConsent` CustomEvent with category booleans:
 * `{ detail: { analytics, affiliate, advertising, bannerVersion, gpc } }`.
 */

import * as Sentry from "@sentry/browser";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || "";
const CMP_COOKIE_NAME = "cc_cookie";

interface CmpConsentCookie {
  categories?: unknown;
  /** Backward-compatible with older CMP payload examples/docs that used `level`. */
  level?: unknown;
}

interface CookieConsentEventDetail {
  analytics: boolean;
  affiliate?: boolean;
  advertising?: boolean;
  bannerVersion?: string;
  gpc?: boolean;
}

function cookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
  return match?.[1] ?? null;
}

/** Check if analytics/non-essential cookies have been accepted. */
function hasAnalyticsConsent(): boolean {
  const raw = cookieValue(CMP_COOKIE_NAME);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as CmpConsentCookie;
    const categories = Array.isArray(parsed.categories) ? parsed.categories : parsed.level;
    return Array.isArray(categories) && categories.includes("analytics");
  } catch {
    return false;
  }
}

let sentryInitialized = false;

function initSentry() {
  if (sentryInitialized || !SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    // F-10: Route exceptions at 100% - sampleRate defaults to 1.0 (100%)
    // Explicitly set to ensure all errors are captured
    sampleRate: 1.0,
    // F-10: Keep traces at 10% for performance monitoring cost control
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0.1,
    environment: process.env.NODE_ENV ?? "development",
    // Do not send PII.
    sendDefaultPii: false,
  });
  sentryInitialized = true;
}

function teardownSentry() {
  if (!sentryInitialized) return;
  void Sentry.close(2000);
  sentryInitialized = false;
}

// Initialize immediately if consent was previously granted.
if (typeof window !== "undefined") {
  if (hasAnalyticsConsent()) {
    initSentry();
  }

  // Listen for consent changes from the CMP banner. Sentry is gated on the
  // analytics category specifically, not the affiliate/advertising categories.
  window.addEventListener("cookieConsent", ((event: CustomEvent<CookieConsentEventDetail>) => {
    if (event.detail.analytics) {
      initSentry();
    } else {
      teardownSentry();
    }
  }) as EventListener);
}
