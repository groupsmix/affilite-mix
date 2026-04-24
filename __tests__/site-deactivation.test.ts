/**
 * Tests for the middleware DB-fallback deactivation branch.
 *
 * When a hostname is not in the static `config/sites` registry, middleware
 * falls back to a direct DB lookup via `getSiteRowByDomain()`. If the DB
 * reports the site exists but is deactivated (`is_active: false`), middleware
 * must short-circuit with the tenant-aware "Niche Not Found" 404 rewrite
 * rather than continuing to inject an `x-site-id` header for a disabled tenant.
 *
 * These tests mock `getSiteRowByDomain` so no real Supabase call happens —
 * the deactivation decision lives in middleware itself.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/dal/sites", () => ({
  getSiteRowByDomain: vi.fn(),
}));

import { middleware } from "@/middleware";
import { getSiteRowByDomain } from "@/lib/dal/sites";

const mockedGetSiteRowByDomain = vi.mocked(getSiteRowByDomain);

describe("middleware DB-fallback deactivation branch", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token");
    mockedGetSiteRowByDomain.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns styled 'Niche Not Found' 404 when DB reports site is deactivated", async () => {
    mockedGetSiteRowByDomain.mockResolvedValueOnce({
      id: "uuid-deactivated",
      slug: "deactivated-site",
      name: "Deactivated",
      domain: "deactivated.example.com",
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

    const req = new NextRequest("https://deactivated.example.com/");
    const res = await middleware(req);

    expect(mockedGetSiteRowByDomain).toHaveBeenCalledWith("deactivated.example.com");
    expect(res.status).toBe(404);
    // Middleware now rewrites to /not-found for tenant-aware branding
    expect(res.headers.get("x-middleware-rewrite")).toContain("/not-found");
    // Deactivated tenants must NOT leak through to downstream handlers.
    expect(res.headers.get("x-site-id")).toBeNull();
  });

  it("falls through to 404 when DB reports no matching site (null)", async () => {
    mockedGetSiteRowByDomain.mockResolvedValueOnce(null);

    const req = new NextRequest("https://unknown.example.com/");
    const res = await middleware(req);

    expect(res.status).toBe(404);
    // Middleware rewrites to /not-found for tenant-aware branding
    expect(res.headers.get("x-middleware-rewrite")).toContain("/not-found");
  });

  it("injects x-site-id header and proceeds when DB reports site is active", async () => {
    mockedGetSiteRowByDomain.mockResolvedValueOnce({
      id: "uuid-active",
      slug: "active-site",
      name: "Active",
      domain: "active.example.com",
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

    const req = new NextRequest("https://active.example.com/");
    const res = await middleware(req);

    // NextResponse.next() returns a 200 rewrite with the x-middleware-next header.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
