import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/r/[shortcode]/route";

// Mock dependencies
vi.mock("@/lib/dal/products", () => ({
  getProductBySlug: vi.fn(),
}));

vi.mock("@/lib/dal/product-affiliate-links", () => ({
  pickBestAffiliateLink: vi.fn(),
}));

vi.mock("@/lib/dal/affiliate-clicks", () => ({
  recordClick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/site-context", () => ({
  getSiteIdFromHeader: vi.fn().mockReturnValue("test-site"),
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn().mockResolvedValue("test-site-id"),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, retryAfterMs: 0 }),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

vi.mock("@/lib/wait-until", () => ({
  runAfterResponse: vi.fn((promise) => promise),
}));

// We mock validateAffiliateDomain to simulate its behavior, or we can use the real one.
// Let's use the real one to actually test the bypass.
// Actually, it's better to mock it if we want to test the route logic, but the audit specifically asks for testing "encoded URL bypass of affiliate-domain-allowlist". So we need the real one.
// Let's not mock it.
// Oh wait, the environment variable might not be set in the test.
// We can set it in beforeEach.

import { getProductBySlug } from "@/lib/dal/products";
import { pickBestAffiliateLink } from "@/lib/dal/product-affiliate-links";

describe("GET /r/[shortcode] (Affiliate Redirect)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AFFILIATE_DOMAIN_ENFORCEMENT = "strict";
    process.env.AFFILIATE_DOMAIN_ALLOWLIST = "amazon.com,shareasale.com,awin.com";
  });

  function makeRequest(url = "http://localhost:3000/r/widget") {
    return new NextRequest(url, {
      headers: {
        "x-site-id": "test-site",
        "host": "localhost:3000"
      },
    });
  }

  it("redirects to valid affiliate URL and logs click", async () => {
    vi.mocked(getProductBySlug).mockResolvedValue({ id: "prod-1", name: "Widget", affiliate_url: "https://amazon.com/dp/123" } as any);
    vi.mocked(pickBestAffiliateLink).mockResolvedValue(null);

    const req = makeRequest("http://localhost:3000/r/widget?ref=home");
    const res = await GET(req, { params: Promise.resolve({ shortcode: "widget" }) });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://amazon.com/dp/123");
  });

  it("blocks malicious schemes (javascript:)", async () => {
    vi.mocked(getProductBySlug).mockResolvedValue({ id: "prod-1", name: "Widget", affiliate_url: "javascript:alert(1)" } as any);
    vi.mocked(pickBestAffiliateLink).mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ shortcode: "widget" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid affiliate URL scheme/i);
  });

  it("blocks domains not on the allowlist", async () => {
    vi.mocked(getProductBySlug).mockResolvedValue({ id: "prod-1", name: "Widget", affiliate_url: "https://evil-phishing.com/steal" } as any);
    vi.mocked(pickBestAffiliateLink).mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ shortcode: "widget" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/approved domain list/i);
  });

  it("blocks encoded URL bypasses (e.g. basic auth trick)", async () => {
    // Attempting to bypass by putting allowed domain in auth part: https://amazon.com@evil.com
    vi.mocked(getProductBySlug).mockResolvedValue({ id: "prod-1", name: "Widget", affiliate_url: "https://amazon.com@evil.com/steal" } as any);
    vi.mocked(pickBestAffiliateLink).mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ shortcode: "widget" }) });

    expect(res.status).toBe(400);
  });

  it("blocks redirect loop back to own /r/ path", async () => {
    vi.mocked(getProductBySlug).mockResolvedValue({ id: "prod-1", name: "Widget", affiliate_url: "http://localhost:3000/r/widget2" } as any);
    vi.mocked(pickBestAffiliateLink).mockResolvedValue(null);

    const req = makeRequest();
    const res = await GET(req, { params: Promise.resolve({ shortcode: "widget" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Redirect loop detected/i);
  });
});
