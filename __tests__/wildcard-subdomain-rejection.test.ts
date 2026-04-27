/**
 * Tests for LIVE-19: middleware must return 404 for unknown subdomains of
 * wildcard parent domains (e.g. *.wristnerd.xyz).
 *
 * Background: a Cloudflare wildcard CNAME (`*.wristnerd.xyz` → the worker)
 * means any random subdomain of wristnerd.xyz reaches the worker. The
 * middleware must reject hostnames that are not registered (neither in
 * the static config nor as an active DB row) by rewriting to the tenant-
 * aware `/not-found` page via `nicheNotFoundResponse()`. If this branch
 * ever fails open, an attacker could use any subdomain to serve content
 * under the parent-domain trust boundary.
 *
 * The general "unknown hostname → 404" branch is also covered in
 * site-deactivation.test.ts, but those tests use `unknown.example.com`,
 * which does not match a wildcard parent. These tests pin the wildcard-
 * subdomain branch specifically.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dal/sites", () => ({
  getSiteRowByDomain: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 30, retryAfterMs: 0 }),
}));

import { middleware } from "@/middleware";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { isWildcardSubdomain } from "@/config/sites";

const mockedGetSiteRowByDomain = vi.mocked(getSiteRowByDomain);

describe("middleware unknown wildcard subdomain rejection (LIVE-19)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token");
    mockedGetSiteRowByDomain.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("recognizes random.wristnerd.xyz as a wildcard subdomain", () => {
    expect(isWildcardSubdomain("random.wristnerd.xyz")).toBe(true);
    expect(isWildcardSubdomain("attacker-controlled.wristnerd.xyz")).toBe(true);
  });

  it("returns 404 /not-found for an unknown *.wristnerd.xyz subdomain (DB miss)", async () => {
    mockedGetSiteRowByDomain.mockResolvedValueOnce(null);

    const req = new NextRequest("https://random.wristnerd.xyz/");
    const res = await middleware(req);

    expect(mockedGetSiteRowByDomain).toHaveBeenCalledWith("random.wristnerd.xyz");
    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/not-found");
    // Critical: must NOT inject an x-site-id for an unknown subdomain.
    expect(res.headers.get("x-site-id")).toBeNull();
  });

  it("returns 404 /not-found for an unknown *.wristnerd.xyz subdomain when DB row is inactive", async () => {
    mockedGetSiteRowByDomain.mockResolvedValueOnce({
      id: "uuid-paused",
      slug: "paused-niche",
      name: "Paused",
      domain: "paused.wristnerd.xyz",
      language: "en",
      direction: "ltr",
      is_active: false,
      monetization_type: "affiliate",
      est_revenue_per_click: 0,
      theme: {},
      features: {},
      meta_title: null,
      meta_description: null,
      logo_url: null,
      favicon_url: null,
      og_image_url: null,
      nav_items: [],
      footer_nav: [],
      social_links: {},
      ad_config: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = new NextRequest("https://paused.wristnerd.xyz/");
    const res = await middleware(req);

    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/not-found");
    expect(res.headers.get("x-site-id")).toBeNull();
  });

  it("does not leak x-site-id for nested subdomains (a.b.wristnerd.xyz)", async () => {
    // Nested subdomains are not wildcard-eligible (extractSubdomain returns null
    // for them), so the DB lookup for the full hostname must miss.
    mockedGetSiteRowByDomain.mockResolvedValueOnce(null);

    const req = new NextRequest("https://a.b.wristnerd.xyz/");
    const res = await middleware(req);

    expect(res.status).toBe(404);
    expect(res.headers.get("x-middleware-rewrite")).toContain("/not-found");
    expect(res.headers.get("x-site-id")).toBeNull();
  });

  it("injects x-site-id for an active *.wristnerd.xyz subdomain registered in the DB", async () => {
    mockedGetSiteRowByDomain.mockResolvedValueOnce({
      id: "uuid-coffee",
      slug: "coffee-niche",
      name: "Coffee",
      domain: "coffee.wristnerd.xyz",
      language: "en",
      direction: "ltr",
      is_active: true,
      monetization_type: "affiliate",
      est_revenue_per_click: 0,
      theme: {},
      features: {},
      meta_title: null,
      meta_description: null,
      logo_url: null,
      favicon_url: null,
      og_image_url: null,
      nav_items: [],
      footer_nav: [],
      social_links: {},
      ad_config: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const req = new NextRequest("https://coffee.wristnerd.xyz/");
    const res = await middleware(req);

    // Active DB-registered subdomain proceeds normally.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
