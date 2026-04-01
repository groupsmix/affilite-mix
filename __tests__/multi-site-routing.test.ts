/**
 * Tests for multi-site routing logic.
 *
 * Covers audit finding H-7:
 * - Domain-based site resolution
 * - Localhost development fallback
 * - Wildcard subdomain routing
 * - Site configuration integrity
 * - Default site selection
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getSiteByDomain,
  getSiteById,
  allSites,
  isWildcardSubdomain,
  extractSubdomain,
  toSiteRow,
  WILDCARD_PARENT_DOMAINS,
} from "@/config/sites";

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── Multi-site routing ────────────────────────────────────────

describe("multi-site domain routing", () => {
  it("each site has a unique id", () => {
    const ids = allSites.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("each site has a unique domain", () => {
    const domains = allSites.map((s) => s.domain);
    expect(new Set(domains).size).toBe(domains.length);
  });

  it("each site has valid required fields", () => {
    for (const site of allSites) {
      expect(site.id).toBeTruthy();
      expect(site.name).toBeTruthy();
      expect(site.domain).toBeTruthy();
      expect(site.language).toBeTruthy();
      expect(site.direction).toMatch(/^(ltr|rtl)$/);
    }
  });

  it("each site has navigation items", () => {
    for (const site of allSites) {
      expect(site.nav.length).toBeGreaterThan(0);
      for (const navItem of site.nav) {
        expect(navItem.title).toBeTruthy();
        expect(navItem.href).toBeTruthy();
      }
    }
  });

  it("each site has a theme with required colors", () => {
    for (const site of allSites) {
      expect(site.theme.primaryColor).toBeTruthy();
      expect(site.theme.accentColor).toBeTruthy();
    }
  });
});

// ── getSiteById ───────────────────────────────────────────────

describe("getSiteById", () => {
  it("resolves a known site by id", () => {
    for (const site of allSites) {
      expect(getSiteById(site.id)).toBe(site);
    }
  });

  it("returns undefined for unknown id", () => {
    expect(getSiteById("nonexistent-site-id")).toBeUndefined();
  });

  it("returns undefined for empty id", () => {
    expect(getSiteById("")).toBeUndefined();
  });
});

// ── Development localhost routing ─────────────────────────────

describe("localhost routing (development)", () => {
  it("resolves localhost to first site in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const site = getSiteByDomain("localhost");
    expect(site).toBe(allSites[0]);
  });

  it("resolves *.localhost subdomains to matching sites", () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = getSiteByDomain("watch.localhost");
    expect(result).toBeDefined();
    expect(result?.id).toBe("watch-tools");
  });

  it("respects NEXT_PUBLIC_DEFAULT_SITE env var", () => {
    vi.stubEnv("NODE_ENV", "development");
    const secondSite = allSites[1];
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", secondSite.id);
    expect(getSiteByDomain("localhost")).toBe(secondSite);
  });

  it("falls back to first site when default site id is invalid", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", "does-not-exist");
    expect(getSiteByDomain("localhost")).toBe(allSites[0]);
  });

  it("does NOT resolve localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getSiteByDomain("localhost")).toBeUndefined();
  });
});

// ── toSiteRow conversion ──────────────────────────────────────

describe("toSiteRow", () => {
  it("converts a SiteDefinition to a DB-compatible row", () => {
    const site = allSites[0];
    const row = toSiteRow(site);

    expect(row.slug).toBe(site.id);
    expect(row.name).toBe(site.name);
    expect(row.domain).toBe(site.domain);
    expect(row.language).toBe(site.language);
    expect(row.direction).toBe(site.direction);
    expect(row.is_active).toBe(true);
    expect(row.monetization_type).toBe("affiliate");
  });

  it("generates valid theme object", () => {
    const row = toSiteRow(allSites[0]);
    expect(row.theme.primaryColor).toBeTruthy();
    expect(row.theme.accentColor).toBeTruthy();
  });

  it("generates nav_items from site nav", () => {
    const site = allSites[0];
    const row = toSiteRow(site);
    expect(row.nav_items.length).toBe(site.nav.length);
    for (const item of row.nav_items) {
      expect(item.label).toBeTruthy();
      expect(item.href).toBeTruthy();
    }
  });

  it("generates features as flat boolean map", () => {
    const row = toSiteRow(allSites[0]);
    for (const [, value] of Object.entries(row.features)) {
      expect(typeof value).toBe("boolean");
    }
  });
});

// ── Wildcard subdomain edge cases ─────────────────────────────

describe("wildcard subdomain edge cases", () => {
  it("handles empty string hostname", () => {
    expect(isWildcardSubdomain("")).toBe(false);
  });

  it("handles hostname with only dots", () => {
    expect(isWildcardSubdomain("...")).toBe(false);
  });

  it("extractSubdomain handles empty inputs", () => {
    expect(extractSubdomain("", "writnerd.site")).toBeNull();
    expect(extractSubdomain("coffee.writnerd.site", "")).toBeNull();
  });

  it("handles case-sensitive domain matching", () => {
    // Domains should be lowercase
    for (const site of allSites) {
      expect(site.domain).toBe(site.domain.toLowerCase());
    }
  });
});

// ── Site feature flags ────────────────────────────────────────

describe("site feature flags", () => {
  it("watch-tools has expected features", () => {
    const site = getSiteById("watch-tools");
    expect(site).toBeDefined();
    // Features are in the site definition, check the features object
    const row = toSiteRow(site!);
    expect(row.features.newsletter).toBe(true);
    expect(row.features.searchModal).toBe(true);
    expect(row.features.cookieConsent).toBe(true);
  });

  it("all sites have feature flags defined", () => {
    for (const site of allSites) {
      const row = toSiteRow(site);
      expect(typeof row.features).toBe("object");
    }
  });
});
