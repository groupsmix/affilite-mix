/**
 * #25 regression locks for browser Sentry consent gating.
 *
 * The CMP dispatches category booleans and stores choices in vanilla-cookieconsent's
 * `cc_cookie`. Sentry must follow that schema, not the removed homemade banner's
 * `nh-cookie-consent-*` cookie or an `accepted` event field.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "..");

function readFile(...parts: string[]): string {
  return fs.readFileSync(path.join(REPO_ROOT, ...parts), "utf8");
}

function hasAnalyticsConsentFromCookie(cookieStr: string): boolean {
  const match = cookieStr.match(/(?:^|;\s*)cc_cookie=([^;]*)/);
  const raw = match?.[1];
  if (!raw) return false;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as {
      categories?: unknown;
      level?: unknown;
    };
    const categories = Array.isArray(parsed.categories) ? parsed.categories : parsed.level;
    return Array.isArray(categories) && categories.includes("analytics");
  } catch {
    return false;
  }
}

describe("#25 Sentry consent event alignment", () => {
  const sentryConfig = readFile("sentry.client.config.ts");
  const cmpSource = readFile("app", "(public)", "components", "cookie-consent-cmp.tsx");

  it("CMP dispatches cookieConsent with an analytics category field", () => {
    expect(cmpSource).toContain('window.dispatchEvent(new CustomEvent("cookieConsent"');
    expect(cmpSource).toContain('analytics: CookieConsent.acceptedCategory("analytics")');
  });

  it("Sentry listens to event.detail.analytics, not event.detail.accepted", () => {
    expect(sentryConfig).toContain("event.detail.analytics");
    expect(sentryConfig).not.toContain("event.detail.accepted");
    expect(sentryConfig).toContain("CookieConsentEventDetail");
  });

  it("Sentry reads vanilla-cookieconsent cc_cookie, not the removed homemade cookie", () => {
    expect(sentryConfig).toContain('const CMP_COOKIE_NAME = "cc_cookie"');
    expect(sentryConfig).not.toContain("nh-cookie-consent");
  });

  it("Sentry checks the analytics category before initializing", () => {
    expect(sentryConfig).toContain('categories.includes("analytics")');
    expect(sentryConfig).toContain("initSentry()");
    expect(sentryConfig).toContain("teardownSentry()");
  });
});

describe("#25 cc_cookie parsing contract", () => {
  it("returns false when cc_cookie is absent", () => {
    expect(hasAnalyticsConsentFromCookie("")).toBe(false);
    expect(hasAnalyticsConsentFromCookie("session=abc")).toBe(false);
  });

  it("returns true when categories includes analytics", () => {
    const value = encodeURIComponent(JSON.stringify({ categories: ["necessary", "analytics"] }));
    expect(hasAnalyticsConsentFromCookie(`cc_cookie=${value}`)).toBe(true);
  });

  it("returns false when categories omits analytics", () => {
    const value = encodeURIComponent(JSON.stringify({ categories: ["necessary", "affiliate"] }));
    expect(hasAnalyticsConsentFromCookie(`cc_cookie=${value}`)).toBe(false);
  });

  it("supports the older level array shape defensively", () => {
    const value = encodeURIComponent(JSON.stringify({ level: ["necessary", "analytics"] }));
    expect(hasAnalyticsConsentFromCookie(`cc_cookie=${value}`)).toBe(true);
  });

  it("works when cc_cookie is surrounded by other cookies", () => {
    const value = encodeURIComponent(
      JSON.stringify({ categories: ["necessary", "analytics", "affiliate"] }),
    );
    expect(hasAnalyticsConsentFromCookie(`session=abc; cc_cookie=${value}; other=xyz`)).toBe(true);
  });

  it("returns false for malformed JSON", () => {
    expect(hasAnalyticsConsentFromCookie("cc_cookie=not-json")).toBe(false);
  });
});
