import { describe, it, expect, vi, afterEach } from "vitest";
import { getSiteByDomain, allSites, arabicToolsSite, cryptoToolsSite } from "@/config/sites";

describe("getSiteByDomain", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns a site by its primary domain", () => {
    const site = allSites[0];
    expect(getSiteByDomain(site!.domain)).toBe(site);
  });

  it("returns a site by its alias", () => {
    const siteWithAlias = allSites.find((s) => s.aliases && s.aliases.length > 0);
    if (!siteWithAlias) return;
    expect(getSiteByDomain(siteWithAlias.aliases![0]!)).toBe(siteWithAlias);
  });

  it("returns undefined for an unknown domain in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(getSiteByDomain("unknown.example.com")).toBeUndefined();
  });

  it("returns undefined for localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCALHOST_FALLBACK_IN_PROD", "");
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
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", secondSite!.id);
    expect(getSiteByDomain("localhost")).toBe(secondSite);
  });

  it("falls back to first site when NEXT_PUBLIC_DEFAULT_SITE is invalid", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", "nonexistent-site");
    expect(getSiteByDomain("localhost")).toBe(allSites[0]);
  });

  // ── .localhost dev subdomains (site.id / slug match) ─────────
  // Pattern inspired by vercel/platforms (MIT).

  it("resolves <slug>.localhost to the matching site in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteByDomain("arabic-tools.localhost")).toBe(arabicToolsSite);
    expect(getSiteByDomain("crypto-tools.localhost")).toBe(cryptoToolsSite);
  });

  it("resolves <slug>.localhost:<port> to the matching site in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteByDomain("arabic-tools.localhost:3000")).toBe(arabicToolsSite);
    expect(getSiteByDomain("crypto-tools.localhost:3000")).toBe(cryptoToolsSite);
  });

  it("returns undefined for an unknown <slug>.localhost in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(getSiteByDomain("unknown.localhost")).toBeUndefined();
    expect(getSiteByDomain("unknown.localhost:3000")).toBeUndefined();
  });

  it("does not resolve <slug>.localhost in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCALHOST_FALLBACK_IN_PROD", "");
    expect(getSiteByDomain("arabic-tools.localhost")).toBeUndefined();
    expect(getSiteByDomain("arabic-tools.localhost:3000")).toBeUndefined();
  });

  it("still matches real production domains exactly", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const site of allSites) {
      expect(getSiteByDomain(site.domain)).toBe(site);
    }
  });

  // ── ALLOW_LOCALHOST_FALLBACK_IN_PROD opt-in (Lighthouse CI) ─────
  // The flag must re-enable the localhost → default-site resolution
  // under NODE_ENV=production so CI can hit localhost without tripping
  // the middleware's unknown-hostname rate-limit. It must NOT affect
  // resolution of unrelated production domains.

  it("resolves localhost in production when ALLOW_LOCALHOST_FALLBACK_IN_PROD=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCALHOST_FALLBACK_IN_PROD", "1");
    expect(getSiteByDomain("localhost")).toBe(allSites[0]);
  });

  it("honours NEXT_PUBLIC_DEFAULT_SITE for localhost in production when opted in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCALHOST_FALLBACK_IN_PROD", "1");
    const secondSite = allSites[1];
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", secondSite!.id);
    expect(getSiteByDomain("localhost")).toBe(secondSite);
  });

  it("ignores ALLOW_LOCALHOST_FALLBACK_IN_PROD when the value is not exactly '1'", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCALHOST_FALLBACK_IN_PROD", "true");
    expect(getSiteByDomain("localhost")).toBeUndefined();
  });

  it("does NOT apply the opt-in fallback to unknown non-localhost domains", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_LOCALHOST_FALLBACK_IN_PROD", "1");
    expect(getSiteByDomain("unknown.example.com")).toBeUndefined();
  });
});
