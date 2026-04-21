/**
 * Tests for the middleware DB-fallback deactivation branch.
 *
 * When a hostname is not in the static `config/sites` registry, middleware
 * falls back to `/api/internal/resolve-site`. If that endpoint reports the
 * site exists but is deactivated (`isActive: false`), middleware must short
 * circuit with the styled "Niche Not Found" 404 HTML page rather than
 * continuing to inject an `x-site-id` header for a disabled tenant.
 *
 * These tests mock `global.fetch` so no real Supabase call happens — the
 * deactivation decision lives in middleware itself.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

const ORIGINAL_FETCH = global.fetch;

describe("middleware DB-fallback deactivation branch", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_TOKEN", "test-internal-token");
  });

  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns styled 'Niche Not Found' 404 when DB reports site is deactivated", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("/api/internal/resolve-site");
      expect(url).toContain("domain=deactivated.example.com");
      return new Response(JSON.stringify({ siteId: "deactivated-site", isActive: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const req = new NextRequest("https://deactivated.example.com/");
    const res = await middleware(req);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const body = await res.text();
    expect(body).toContain("Niche Not Found");
    expect(body).toContain("no longer active");
    // Deactivated tenants must NOT leak through to downstream handlers.
    expect(res.headers.get("x-site-id")).toBeNull();
  });

  it("falls through to 404 when DB reports no matching site (siteId=null)", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ siteId: null, isActive: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const req = new NextRequest("https://unknown.example.com/");
    const res = await middleware(req);

    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).toContain("Niche Not Found");
  });

  it("injects x-site-id header and proceeds when DB reports site is active", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ siteId: "active-site", isActive: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    global.fetch = fetchMock as unknown as typeof global.fetch;

    const req = new NextRequest("https://active.example.com/");
    const res = await middleware(req);

    // NextResponse.next() returns a 200 rewrite with the x-middleware-next header.
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
