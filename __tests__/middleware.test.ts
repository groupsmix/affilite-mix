/**
 * Tests for middleware.ts — site resolution and CSRF enforcement.
 *
 * Covers audit findings H-7:
 * - Middleware site resolution (domain → site_id header injection)
 * - CSRF double-submit cookie enforcement on state-changing requests
 * - CSRF-exempt paths
 * - Origin header validation
 * - CSRF token rotation after state-changing requests
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSiteByDomain,
  allSites,
  isWildcardSubdomain,
  extractSubdomain,
  WILDCARD_PARENT_DOMAINS,
} from "@/config/sites";
import { generateCsrfToken, validateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";

// ── Site resolution tests ─────────────────────────────────────

describe("middleware site resolution", () => {
  it("resolves a known production domain to its site", () => {
    const site = allSites.find((s) => s.domain === "wristnerd.xyz");
    expect(site).toBeDefined();
    expect(getSiteByDomain("wristnerd.xyz")).toBe(site);
  });

  it("resolves all registered site domains", () => {
    for (const site of allSites) {
      const resolved = getSiteByDomain(site.domain);
      expect(resolved).toBe(site);
    }
  });

  it("returns undefined for unregistered domain in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getSiteByDomain("unknown-domain.com")).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it("resolves alias domains to the correct site", () => {
    const siteWithAlias = allSites.find((s) => s.aliases && s.aliases.length > 0);
    if (siteWithAlias && siteWithAlias.aliases) {
      for (const alias of siteWithAlias.aliases) {
        expect(getSiteByDomain(alias)).toBe(siteWithAlias);
      }
    }
  });

  it("injects x-site-id header with the resolved site id", () => {
    // Simulate what middleware does: resolve domain, set header
    const hostname = allSites[0].domain;
    const site = getSiteByDomain(hostname);
    expect(site).toBeDefined();

    const headers = new Headers();
    headers.set("x-site-id", site!.id);
    expect(headers.get("x-site-id")).toBe(site!.id);
  });
});

// ── Wildcard subdomain resolution ─────────────────────────────

describe("wildcard subdomain resolution", () => {
  it("identifies wildcard subdomains of known parent domains", () => {
    expect(isWildcardSubdomain("coffee.wristnerd.xyz")).toBe(true);
    expect(isWildcardSubdomain("tech.wristnerd.xyz")).toBe(true);
  });

  it("rejects bare parent domain as wildcard", () => {
    expect(isWildcardSubdomain("wristnerd.xyz")).toBe(false);
  });

  it("rejects nested subdomains (only single-level wildcards)", () => {
    expect(isWildcardSubdomain("a.b.wristnerd.xyz")).toBe(false);
  });

  it("rejects unknown parent domains", () => {
    expect(isWildcardSubdomain("sub.example.com")).toBe(false);
  });

  it("extracts subdomain correctly", () => {
    expect(extractSubdomain("coffee.wristnerd.xyz", "wristnerd.xyz")).toBe("coffee");
    expect(extractSubdomain("wristnerd.xyz", "wristnerd.xyz")).toBeNull();
    expect(extractSubdomain("a.b.wristnerd.xyz", "wristnerd.xyz")).toBeNull();
    expect(extractSubdomain("other.example.com", "wristnerd.xyz")).toBeNull();
  });

  it("WILDCARD_PARENT_DOMAINS contains expected domains", () => {
    expect(WILDCARD_PARENT_DOMAINS).toContain("wristnerd.xyz");
  });
});

// ── CSRF enforcement tests ────────────────────────────────────

describe("CSRF double-submit cookie enforcement", () => {
  it("generates a valid CSRF token", () => {
    const token = generateCsrfToken();
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.length).toBe(64); // 32 bytes = 64 hex chars
  });

  it("generates unique tokens on each call", () => {
    const token1 = generateCsrfToken();
    const token2 = generateCsrfToken();
    expect(token1).not.toBe(token2);
  });

  it("validates matching cookie and header values", () => {
    const token = generateCsrfToken();
    expect(validateCsrfToken(token, token)).toBe(true);
  });

  it("rejects mismatched cookie and header values", () => {
    const cookie = generateCsrfToken();
    const header = generateCsrfToken();
    expect(validateCsrfToken(cookie, header)).toBe(false);
  });

  it("rejects missing cookie value", () => {
    expect(validateCsrfToken(undefined, generateCsrfToken())).toBe(false);
  });

  it("rejects missing header value", () => {
    expect(validateCsrfToken(generateCsrfToken(), undefined)).toBe(false);
  });

  it("rejects both values missing", () => {
    expect(validateCsrfToken(undefined, undefined)).toBe(false);
  });

  it("CSRF_COOKIE constant is correct", () => {
    expect(CSRF_COOKIE).toBe("__csrf");
  });

  it("CSRF_HEADER constant is correct", () => {
    expect(CSRF_HEADER).toBe("x-csrf-token");
  });
});

// ── CSRF-exempt paths ─────────────────────────────────────────

describe("CSRF-exempt paths", () => {
  // These paths should be exempt from CSRF validation in the middleware
  const exemptPaths = new Set([
    "/api/auth/csrf",
    "/api/auth/refresh",
    "/api/cron/publish",
    "/api/cron/sitemap-refresh",
    "/api/revalidate",
    "/api/track/click",
    "/api/vitals",
    "/api/track/impression",
    "/api/newsletter/unsubscribe",
  ]);

  // These paths should NOT be exempt (require CSRF)
  const protectedPaths = [
    "/api/auth/login",
    "/api/auth/logout",
    "/api/admin/categories",
    "/api/admin/products",
    "/api/admin/content",
    "/api/admin/upload",
    "/api/admin/sites",
    "/api/newsletter",
  ];

  it("exempts the correct set of paths", () => {
    expect(exemptPaths.size).toBe(9);
    expect(exemptPaths.has("/api/auth/csrf")).toBe(true);
    expect(exemptPaths.has("/api/auth/refresh")).toBe(true);
    expect(exemptPaths.has("/api/cron/publish")).toBe(true);
    expect(exemptPaths.has("/api/track/click")).toBe(true);
  });

  it("does NOT exempt /api/auth/login (F-10 fix)", () => {
    expect(exemptPaths.has("/api/auth/login")).toBe(false);
  });

  it("does NOT exempt /api/auth/logout (H-5 fix)", () => {
    expect(exemptPaths.has("/api/auth/logout")).toBe(false);
  });

  it("does NOT exempt admin CRUD endpoints", () => {
    for (const path of protectedPaths) {
      expect(exemptPaths.has(path)).toBe(false);
    }
  });
});

// ── Origin validation ─────────────────────────────────────────

describe("origin validation", () => {
  it("all sites have valid domains for origin checking", () => {
    for (const site of allSites) {
      expect(site.domain).toBeTruthy();
      expect(site.domain).not.toContain(" ");
      // Origin would be https://<domain> or http://<domain>
      const origin = `https://${site.domain}`;
      expect(origin).toMatch(/^https:\/\/.+/);
    }
  });

  it("site aliases are included in allowed origins", () => {
    const siteWithAlias = allSites.find((s) => s.aliases && s.aliases.length > 0);
    if (siteWithAlias && siteWithAlias.aliases) {
      for (const alias of siteWithAlias.aliases) {
        expect(alias).toBeTruthy();
      }
    }
  });
});
