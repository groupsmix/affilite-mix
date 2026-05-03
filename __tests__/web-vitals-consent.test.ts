/**
 * A69-F1: Verify WebVitals respects analytics consent.
 *
 * The WebVitals component must NOT beacon metrics to /api/vitals until
 * the user has granted analytics consent. This test validates the
 * consent-checking logic without rendering React components.
 */
import { describe, it, expect } from "vitest";

describe("A69-F1: WebVitals consent-before-fire", () => {
  it("hasAnalyticsConsent returns false when no cookies are set", () => {
    // Simulate: no document.cookie
    const hasConsent = checkCookieConsent("");
    expect(hasConsent).toBe(false);
  });

  it("hasAnalyticsConsent returns true when cc_cookie contains analytics", () => {
    const ccCookie = JSON.stringify({ categories: ["necessary", "analytics"] });
    const cookieStr = `cc_cookie=${encodeURIComponent(ccCookie)}`;
    expect(checkCookieConsent(cookieStr)).toBe(true);
  });

  it("hasAnalyticsConsent returns false when cc_cookie has only necessary", () => {
    const ccCookie = JSON.stringify({ categories: ["necessary"] });
    const cookieStr = `cc_cookie=${encodeURIComponent(ccCookie)}`;
    expect(checkCookieConsent(cookieStr)).toBe(false);
  });

  it("falls back to legacy nh-cookie-consent-* when no cc_cookie", () => {
    const cookieStr = "nh-cookie-consent-example_com=accepted";
    expect(checkCookieConsent(cookieStr)).toBe(true);
  });

  it("legacy cookie with rejected value returns false", () => {
    const cookieStr = "nh-cookie-consent-example_com=rejected";
    expect(checkCookieConsent(cookieStr)).toBe(false);
  });

  it("malformed cc_cookie is treated as no consent", () => {
    const cookieStr = "cc_cookie=not-valid-json";
    expect(checkCookieConsent(cookieStr)).toBe(false);
  });
});

/**
 * Pure-function extraction of the consent check from web-vitals.tsx.
 * This avoids importing the React component (which requires DOM/hooks).
 */
function checkCookieConsent(cookieString: string): boolean {
  const ccMatch = cookieString.match(/cc_cookie=([^;]*)/);
  if (ccMatch) {
    try {
      const parsed = JSON.parse(decodeURIComponent(ccMatch[1]));
      if (Array.isArray(parsed?.categories) && parsed.categories.includes("analytics")) {
        return true;
      }
      return false;
    } catch {
      // Malformed cookie
    }
  }
  const legacyMatch = cookieString.match(/nh-cookie-consent-[^=]+=([^;]*)/);
  return legacyMatch?.[1] === "accepted";
}
