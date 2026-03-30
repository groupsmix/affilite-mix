import { describe, it, expect, vi, afterEach } from "vitest";
import { getSiteByDomain, allSites } from "@/config/sites";

describe("getSiteByDomain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a site by its primary domain", () => {
    const site = allSites[0];
    expect(getSiteByDomain(site.domain)).toBe(site);
  });

  it("returns a site by its alias", () => {
    const siteWithAlias = allSites.find((s) => s.aliases && s.aliases.length > 0);
    if (!siteWithAlias) return;
    expect(getSiteByDomain(siteWithAlias.aliases![0])).toBe(siteWithAlias);
  });

  it("returns undefined for an unknown domain in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getSiteByDomain("unknown.example.com")).toBeUndefined();
  });

  it("returns undefined for localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getSiteByDomain("localhost")).toBeUndefined();
  });

  it("falls back to first site for localhost in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteByDomain("localhost")).toBe(allSites[0]);
  });

  it("resolves *.localhost subdomains in development via alias prefix", () => {
    vi.stubEnv("NODE_ENV", "development");
    const result = getSiteByDomain("watch.localhost");
    expect(result).toBeDefined();
    expect(result?.id).toBe("watch-tools");
  });

  it("uses NEXT_PUBLIC_DEFAULT_SITE env var when set in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    const secondSite = allSites[1];
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", secondSite.id);
    expect(getSiteByDomain("localhost")).toBe(secondSite);
  });

  it("falls back to first site when NEXT_PUBLIC_DEFAULT_SITE is invalid", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", "nonexistent-site");
    expect(getSiteByDomain("localhost")).toBe(allSites[0]);
  });
});
