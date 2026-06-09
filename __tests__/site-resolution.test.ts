/**
 * F-007 — resolveSite() hot-path branch coverage.
 *
 * The domain→site resolution logic extracted from middleware.ts carries the
 * security-critical fail-closed branches (per-IP flood limit, rate-limit infra
 * failure, DB failure). The existing middleware tests cover the happy/404
 * paths; these lock in the 429/503 branches that were previously unasserted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const getSiteByDomain = vi.fn();
vi.mock("@/config/sites", () => ({
  getSiteByDomain: (...args: unknown[]) => getSiteByDomain(...args),
}));

const getMiddlewareSiteRowByDomain = vi.fn();
vi.mock("@/lib/middleware-site-lookup", () => ({
  getMiddlewareSiteRowByDomain: (...args: unknown[]) => getMiddlewareSiteRowByDomain(...args),
}));

const checkRateLimit = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => checkRateLimit(...args),
}));

vi.mock("@/lib/runtime-env", () => ({
  getAppCacheKV: () => null,
}));

vi.mock("@/lib/security/unknown-host-guard", () => ({
  recordUnknownHostKvAccess: () => ({ allowed: true }),
  getNegativeCacheTtlSeconds: () => 300,
}));

vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { resolveSite } from "@/lib/middleware/site-resolution";

function req(host = "unknown.example.com", path = "/p"): NextRequest {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host, "cf-connecting-ip": "203.0.113.7" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  getSiteByDomain.mockReturnValue(undefined);
  checkRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  getMiddlewareSiteRowByDomain.mockResolvedValue(null);
});

describe("resolveSite (F-007)", () => {
  it("resolves a static-config site without touching the DB", async () => {
    getSiteByDomain.mockReturnValue({ id: "wristnerd", domain: "wristnerd.xyz", aliases: [] });
    const r = await resolveSite(req("wristnerd.xyz"), "wristnerd.xyz");
    expect(r.type).toBe("resolved");
    if (r.type === "resolved") expect(r.siteId).toBe("wristnerd");
    expect(getMiddlewareSiteRowByDomain).not.toHaveBeenCalled();
  });

  it("resolves an active DB-backed custom domain", async () => {
    getMiddlewareSiteRowByDomain.mockResolvedValue({ slug: "acme", is_active: true });
    const r = await resolveSite(req("shop.acme.com"), "shop.acme.com");
    expect(r.type).toBe("resolved");
    if (r.type === "resolved") {
      expect(r.siteId).toBe("acme");
      expect(r.verifiedSite).toEqual({ slug: "acme", domain: "shop.acme.com" });
    }
  });

  it("404s (rewrite) for an unknown host with no DB row", async () => {
    const r = await resolveSite(req(), "unknown.example.com");
    expect(r.type).toBe("response");
    if (r.type === "response") expect(r.response.status).toBe(404);
  });

  it("404s for a deactivated site row", async () => {
    getMiddlewareSiteRowByDomain.mockResolvedValue({ slug: "acme", is_active: false });
    const r = await resolveSite(req(), "unknown.example.com");
    expect(r.type).toBe("response");
    if (r.type === "response") expect(r.response.status).toBe(404);
  });

  it("429s (fail-closed) when the per-IP resolve limit trips", async () => {
    checkRateLimit.mockResolvedValue({ allowed: false, retryAfterMs: 30_000 });
    const r = await resolveSite(req(), "unknown.example.com");
    expect(r.type).toBe("response");
    if (r.type === "response") {
      expect(r.response.status).toBe(429);
      expect(r.response.headers.get("Retry-After")).toBe("30");
    }
    expect(getMiddlewareSiteRowByDomain).not.toHaveBeenCalled();
  });

  it("503s (fail-closed) when the rate-limit infrastructure itself throws", async () => {
    checkRateLimit.mockRejectedValue(new Error("KV down"));
    const r = await resolveSite(req(), "unknown.example.com");
    expect(r.type).toBe("response");
    if (r.type === "response") expect(r.response.status).toBe(503);
    expect(getMiddlewareSiteRowByDomain).not.toHaveBeenCalled();
  });

  it("503s when the DB lookup throws", async () => {
    getMiddlewareSiteRowByDomain.mockRejectedValue(new Error("supabase down"));
    const r = await resolveSite(req(), "unknown.example.com");
    expect(r.type).toBe("response");
    if (r.type === "response") expect(r.response.status).toBe(503);
  });

  it("throws AbortError when the signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(resolveSite(req(), "unknown.example.com", ac.signal)).rejects.toThrow();
  });
});
