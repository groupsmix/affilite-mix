/**
 * LIVE-19 — Wildcard `*.wristnerd.xyz` subdomain handling.
 *
 * The wildcard CNAME on `*.wristnerd.xyz` means random / unprovisioned
 * subdomains can reach the Worker. Middleware must respond with a 404
 * (rewritten to /not-found) for any subdomain that does not resolve to
 * an active site row, and not silently render the apex site under the
 * wrong host.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock the DB lookup so the test stays hermetic.
const getMiddlewareSiteRowByDomain = vi.fn();
vi.mock("@/lib/middleware-site-lookup", () => ({
  getMiddlewareSiteRowByDomain: (...args: unknown[]) => getMiddlewareSiteRowByDomain(...args),
}));

// Mock CSP / Sentry so middleware doesn't try to reach external deps.
vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/csp", () => ({
  buildCspHeader: () => "default-src 'self'",
  generateCspNonce: () => "nonce",
  NONCE_HEADER: "x-csp-nonce",
  buildReportToHeader: () => "",
}));

vi.mock("@/lib/cookie-utils", () => ({ IS_SECURE_COOKIE: false }));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 30, retryAfterMs: 0 }),
}));

function makeRequest(host: string, path = "/"): NextRequest {
  return new NextRequest(`https://${host}${path}`, {
    headers: { host },
  });
}

describe("LIVE-19 — unknown wristnerd.xyz subdomain → 404", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "production");
  });

  it("returns 404 (rewrite to /not-found) when no DB row exists for the host", async () => {
    getMiddlewareSiteRowByDomain.mockResolvedValue(null);

    const { middleware } = await import("@/middleware");
    const res = await middleware(makeRequest("definitely-unprovisioned.wristnerd.xyz"));

    expect(res.status).toBe(404);
    // x-middleware-rewrite header is what NextResponse.rewrite sets.
    const rewriteTarget = res.headers.get("x-middleware-rewrite") ?? "";
    expect(rewriteTarget).toMatch(/\/not-found/);
  });

  it("returns 404 when DB row exists but site is_active=false", async () => {
    getMiddlewareSiteRowByDomain.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000000",
      slug: "deactivated",
      is_active: false,
    });

    const { middleware } = await import("@/middleware");
    const res = await middleware(makeRequest("deactivated.wristnerd.xyz"));

    expect(res.status).toBe(404);
  });

  it("does NOT 404 a known apex domain even if DB lookup misses", async () => {
    // wristnerd.xyz is in the static config, so the DB lookup is not
    // even consulted — the request must succeed (status undefined or
    // 200 from the request handler, never 404 from the middleware).
    getMiddlewareSiteRowByDomain.mockResolvedValue(null);

    const { middleware } = await import("@/middleware");
    const res = await middleware(makeRequest("wristnerd.xyz"));

    expect(res.status).not.toBe(404);
  });
});
