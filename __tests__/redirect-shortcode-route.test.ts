import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetProductBySlug = vi.fn();
const mockPickBestAffiliateLink = vi.fn();
const mockRecordClick = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/dal/products", () => ({
  getProductBySlug: (...args: unknown[]) => mockGetProductBySlug(...args),
}));

vi.mock("@/lib/dal/product-affiliate-links", () => ({
  pickBestAffiliateLink: (...args: unknown[]) => mockPickBestAffiliateLink(...args),
}));

vi.mock("@/lib/dal/affiliate-clicks", () => ({
  recordClick: (...args: unknown[]) => mockRecordClick(...args),
}));

vi.mock("@/lib/site-context", () => ({
  getSiteIdFromHeader: vi.fn().mockReturnValue("test-site"),
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn().mockResolvedValue("site-uuid-123"),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, retryAfterMs: 0 }),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/wait-until", () => ({
  runAfterResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "@/app/r/[shortcode]/route";

function makeRequest(): NextRequest {
  return new NextRequest("https://compareai.site/r/test-product?ref=review-page", {
    headers: {
      "x-site-id": "test-site",
      "cf-ipcountry": "US",
    },
  });
}

describe("GET /r/[shortcode]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPickBestAffiliateLink.mockResolvedValue(null);
  });

  it("returns 400 when the stored destination is not HTTPS", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-1",
      name: "Insecure Product",
      affiliate_url: "http://amazon.com/insecure",
    });

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ shortcode: "test-product" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid affiliate url scheme/i);
  });

  it("returns 400 when the stored destination is off the affiliate allow-list", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-2",
      name: "Offlist Product",
      affiliate_url: "https://evil.example/phish",
    });

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ shortcode: "test-product" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/approved domain list/i);
  });

  it("redirects to the stored HTTPS destination when it is allow-listed", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-3",
      name: "Allowed Product",
      affiliate_url: "https://amazon.com/dp/allowed",
    });

    const res = await GET(makeRequest(), {
      params: Promise.resolve({ shortcode: "test-product" }),
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://amazon.com/dp/allowed");
    expect(mockRecordClick).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliate_url: "https://amazon.com/dp/allowed",
      }),
    );
  });
});
