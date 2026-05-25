/**
 * Security tests for GET /api/track/click (AUDIT-FIX A3-002)
 *
 * Rules under test:
 *  1. Missing Sec-Fetch-Site  → redirect happens, publishClick NOT called.
 *  2. Sec-Fetch-Site: cross-site → redirect happens, publishClick NOT called.
 *  3. Sec-Fetch-Site: none (direct/email nav) → redirect + publishClick called.
 *  4. Sec-Fetch-Site: same-origin → redirect + publishClick called.
 *  5. Sec-Fetch-Dest: image (even with trusted site) → publishClick NOT called.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPublishClick = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/click-queue", () => ({
  publishClick: (...args: unknown[]) => mockPublishClick(...args),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, retryAfterMs: 0 }),
}));

vi.mock("@/lib/site-context", () => ({
  getSiteIdFromHeader: vi.fn().mockReturnValue("site-slug"),
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn().mockResolvedValue("site-uuid-123"),
}));

vi.mock("@/lib/dal/products", () => ({
  getProductBySlug: vi.fn().mockResolvedValue({
    name: "Test Product",
    affiliate_url: "https://affiliate.example.com/go",
  }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/affiliate-domain-allowlist", () => ({
  validateAffiliateDomain: vi
    .fn()
    .mockReturnValue({ allowed: true, domain: "affiliate.example.com", reason: null }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/wait-until", () => ({
  runAfterResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/internal-hmac", () => ({
  computeHmac: vi.fn().mockResolvedValue("fake-hmac"),
  timingSafeEqual: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/auth", () => ({
  verifyToken: vi.fn().mockRejectedValue(new Error("no token")),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("1.2.3.4"),
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import { GET } from "@/app/api/track/click/route";

// ── Helper ────────────────────────────────────────────────────────────────────

function makeGetRequest(headers: Record<string, string> = {}): NextRequest {
  const url = "https://test.example.com/api/track/click?p=test-product&t=newsletter";
  return new NextRequest(url, {
    method: "GET",
    headers: {
      "x-site-id": "site-slug",
      ...headers,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("GET /api/track/click — Sec-Fetch analytics security (A3-002)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CLICK_CACHE_HMAC_KEY", "test-hmac-key-32-chars-xxxxxxxxxx");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("redirects but does NOT call publishClick when Sec-Fetch-Site header is missing", async () => {
    const req = makeGetRequest({}); // no Sec-Fetch-Site
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("affiliate.example.com");
    expect(mockPublishClick).not.toHaveBeenCalled();
  });

  it("redirects but does NOT call publishClick when Sec-Fetch-Site is cross-site", async () => {
    const req = makeGetRequest({ "sec-fetch-site": "cross-site" });
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("affiliate.example.com");
    expect(mockPublishClick).not.toHaveBeenCalled();
  });

  it("redirects and DOES call publishClick for trusted direct navigation (sec-fetch-site: none)", async () => {
    const req = makeGetRequest({
      "sec-fetch-site": "none",
      "sec-fetch-dest": "document",
    });
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(mockPublishClick).toHaveBeenCalledTimes(1);
  });

  it("redirects and DOES call publishClick for same-origin navigation", async () => {
    const req = makeGetRequest({
      "sec-fetch-site": "same-origin",
      "sec-fetch-dest": "document",
    });
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(mockPublishClick).toHaveBeenCalledTimes(1);
  });

  it("redirects but does NOT call publishClick when Sec-Fetch-Dest is image (even if site is same-origin)", async () => {
    const req = makeGetRequest({
      "sec-fetch-site": "same-origin",
      "sec-fetch-dest": "image",
    });
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(mockPublishClick).not.toHaveBeenCalled();
  });
});
