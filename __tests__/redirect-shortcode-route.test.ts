import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetProductBySlug = vi.fn();
const mockPickBestAffiliateLink = vi.fn();
const mockPublishClick = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/dal/products", () => ({
  getProductBySlug: (...args: unknown[]) => mockGetProductBySlug(...args),
}));

vi.mock("@/lib/dal/product-affiliate-links", () => ({
  pickBestAffiliateLink: (...args: unknown[]) => mockPickBestAffiliateLink(...args),
}));

vi.mock("@/lib/click-queue", () => ({
  publishClick: (...args: unknown[]) => mockPublishClick(...args),
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
  getIpPrefix: vi.fn().mockReturnValue("127.0.0"),
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

// In-memory KV so the shared 24h dedup window is exercised on this path too.
function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

let kv: ReturnType<typeof makeKv>;

vi.mock("@/lib/runtime-env", () => ({
  getAppCacheKV: vi.fn(() => kv),
  getRateLimitKV: vi.fn(() => null),
  getRuntimeEnv: vi.fn(() => ({})),
  getClickQueue: vi.fn(() => null),
  getRateLimiterDO: vi.fn(() => null),
  readGlobalBinding: vi.fn(() => undefined),
}));

import { GET } from "@/app/r/[shortcode]/route";

/** A trusted top-level navigation so the analytics path runs (see M-01). */
function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("https://compareai.site/r/test-product?ref=review-page", {
    headers: {
      "x-site-id": "test-site",
      "cf-ipcountry": "US",
      "sec-fetch-site": "same-origin",
      "sec-fetch-dest": "document",
      ...headers,
    },
  });
}

describe("GET /r/[shortcode]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kv = makeKv();
    vi.stubEnv("CLICK_CACHE_HMAC_KEY", "test-hmac-key-32-chars-xxxxxxxxxx");
    mockPickBestAffiliateLink.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    expect(mockPublishClick).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliate_url: "https://amazon.com/dp/allowed",
      }),
    );
  });

  it("redirects without recording the click for an untrusted navigation", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-4",
      name: "Prefetched Product",
      affiliate_url: "https://amazon.com/dp/prefetched",
    });

    const res = await GET(
      makeRequest({ "sec-fetch-site": "cross-site", "sec-fetch-dest": "image" }),
      {
        params: Promise.resolve({ shortcode: "test-product" }),
      },
    );

    expect(res.status).toBe(302);
    expect(mockPublishClick).not.toHaveBeenCalled();
  });

  it("stores only the origin and path of the referrer", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-5",
      name: "Referred Product",
      affiliate_url: "https://amazon.com/dp/referred",
    });

    await GET(makeRequest({ referer: "https://compareai.site/review?email=user@example.com" }), {
      params: Promise.resolve({ shortcode: "test-product" }),
    });

    expect(mockPublishClick).toHaveBeenCalledWith(
      expect.objectContaining({ referrer: "https://compareai.site/review" }),
    );
  });

  it("counts a reloaded shortcode click only once inside the dedup window", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-6",
      name: "Reloaded Product",
      affiliate_url: "https://amazon.com/dp/reloaded",
    });

    await GET(makeRequest(), { params: Promise.resolve({ shortcode: "test-product" }) });
    await GET(makeRequest(), { params: Promise.resolve({ shortcode: "test-product" }) });

    expect(mockPublishClick).toHaveBeenCalledTimes(1);
    expect([...kv.store.keys()].filter((k) => k.startsWith("click-dedup:"))).toHaveLength(1);
  });
});
