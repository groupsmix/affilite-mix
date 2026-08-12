/**
 * End-to-end contract between the tracking-URL producer and the click handler.
 *
 * `getTrackingUrl()` builds the CTA href; `GET /api/track/click` consumes it.
 * Nothing tied the two together, so a change in the producer's encoding turned
 * every `productName` CTA into a 400. These tests drive the real producer
 * output through the real handler and assert on the redirect, and they cover
 * the destinations a caller must not be able to force.
 *
 * The affiliate domain allow-list is intentionally NOT mocked here: the point
 * is to exercise the whole validation chain.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockPublishClick = vi.fn().mockResolvedValue(undefined);
const mockKV = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
}));
const cacheValue = vi.hoisted(() => ({ value: null as unknown }));

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
  getProductBySlug: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/wait-until", () => ({
  runAfterResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/runtime-env", () => ({
  getAppCacheKV: () => mockKV,
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
  getIpPrefix: vi.fn().mockReturnValue("1.2.3"),
}));

import { GET } from "@/app/api/track/click/route";
import { getTrackingUrl } from "@/lib/tracking-url";
import { getProductBySlug } from "@/lib/dal/products";
import { computeHmac } from "@/lib/internal-hmac";

function requestFor(trackingHref: string): NextRequest {
  return new NextRequest(new URL(trackingHref, "https://test.example.com"), {
    method: "GET",
    headers: {
      "x-site-id": "site-slug",
      "sec-fetch-site": "same-origin",
      "sec-fetch-dest": "document",
    },
  });
}

const AMAZON_DESTINATION = "https://www.amazon.com/dp/B01ABCDEFG?tag=site-20";

beforeEach(() => {
  vi.clearAllMocks();
  cacheValue.value = null;
  mockKV.get.mockImplementation(async (key: string) =>
    key.startsWith("product-url:") ? cacheValue.value : null,
  );
  mockKV.put.mockResolvedValue(undefined);
  vi.stubEnv("CLICK_CACHE_HMAC_KEY", "test-hmac-key-32-chars-xxxxxxxxxx");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/track/click — destinations produced by getTrackingUrl", () => {
  it("records product_id when the slug matches a site-scoped product", async () => {
    vi.mocked(getProductBySlug).mockResolvedValueOnce({
      id: "product-123",
      name: "Dial watch",
      affiliate_url: AMAZON_DESTINATION,
    } as never);
    const href = getTrackingUrl("navigator-automatic", "guide", AMAZON_DESTINATION, true, {
      productName: "Orient Kamasu",
    });

    await GET(requestFor(href));

    expect(mockPublishClick).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "product-123" }),
    );
  });

  it("uses product attribution from a signed cache hit without querying the DB", async () => {
    cacheValue.value = {
      name: "Cached Dial watch",
      url: AMAZON_DESTINATION,
      product_id: "cached-product-123",
      _hmac: "fake-hmac",
    };
    const productLookup = vi.mocked(getProductBySlug);
    productLookup.mockClear();

    await GET(requestFor("/api/track/click?p=navigator-automatic&t=guide"));

    expect(productLookup).not.toHaveBeenCalled();
    expect(mockPublishClick).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "cached-product-123" }),
    );
    expect(computeHmac).toHaveBeenCalledWith(
      "test-hmac-key-32-chars-xxxxxxxxxx",
      "cache",
      "cache",
      JSON.stringify({
        name: "Cached Dial watch",
        url: AMAZON_DESTINATION,
        product_id: "cached-product-123",
      }),
    );
  });

  it("keeps legacy cache entries working and looks up their missing product identity", async () => {
    cacheValue.value = {
      name: "Legacy Dial watch",
      url: AMAZON_DESTINATION,
      _hmac: "fake-hmac",
    };
    const productLookup = vi.mocked(getProductBySlug);
    productLookup.mockResolvedValueOnce({
      id: "legacy-product-123",
      name: "Legacy Dial watch",
      affiliate_url: AMAZON_DESTINATION,
    } as never);

    await GET(requestFor("/api/track/click?p=navigator-automatic&t=guide"));

    expect(productLookup).toHaveBeenCalledTimes(1);
    expect(mockPublishClick).toHaveBeenCalledWith(
      expect.objectContaining({ product_id: "legacy-product-123" }),
    );
    expect(computeHmac).toHaveBeenCalledWith(
      "test-hmac-key-32-chars-xxxxxxxxxx",
      "cache",
      "cache",
      JSON.stringify({ name: "Legacy Dial watch", url: AMAZON_DESTINATION }),
    );
  });

  it("redirects to the destination of a productName CTA", async () => {
    const href = getTrackingUrl("dial-watch", "guide", AMAZON_DESTINATION, true, {
      placement: "ranked-pick",
      productName: "Seiko 5 Sports",
    });

    const res = await GET(requestFor(href));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(AMAZON_DESTINATION);
  });

  it("preserves the UTM parameters of the destination through the round trip", async () => {
    const destination = `${AMAZON_DESTINATION}&utm_source=site&utm_medium=affiliate&utm_campaign=spring`;
    const href = getTrackingUrl("dial-watch", "sticky", destination, true, {
      productName: "Seiko 5 Sports",
    });

    const res = await GET(requestFor(href));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(destination);
  });

  it("still honours links already rendered with the legacy double-encoded destination", async () => {
    const href = `/api/track/click?p=dial-watch&t=guide&u=${encodeURIComponent(
      encodeURIComponent(AMAZON_DESTINATION),
    )}&n=Seiko%205%20Sports`;

    const res = await GET(requestFor(href));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(AMAZON_DESTINATION);
  });

  it("records the click with the caller-supplied destination and name", async () => {
    const href = getTrackingUrl("dial-watch", "guide", AMAZON_DESTINATION, true, {
      productName: "Seiko 5 Sports",
    });

    await GET(requestFor(href));

    expect(mockPublishClick).toHaveBeenCalledTimes(1);
    expect(mockPublishClick.mock.calls[0]?.[0]).toMatchObject({
      product_name: "Seiko 5 Sports",
      affiliate_url: AMAZON_DESTINATION,
    });
  });
});

describe("GET /api/track/click — hostile override destinations", () => {
  it("refuses an affiliate redirector pointed at an arbitrary site", async () => {
    const chained =
      "https://www.awin1.com/cread.php?awinmid=1&awinaffid=999&ued=" +
      encodeURIComponent("https://evil.example.com/phish");
    const href = `/api/track/click?p=dial-watch&t=guide&u=${encodeURIComponent(chained)}&n=x`;

    const res = await GET(requestFor(href));

    expect(res.status).toBe(400);
    expect(mockPublishClick).not.toHaveBeenCalled();
  });

  it("refuses a substituted Amazon associate tag", async () => {
    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "site-20");
    const hijacked = "https://www.amazon.com/dp/B01ABCDEFG?tag=attacker-20";
    const href = `/api/track/click?p=dial-watch&t=guide&u=${encodeURIComponent(hijacked)}&n=x`;

    const res = await GET(requestFor(href));

    expect(res.status).toBe(400);
    expect(mockPublishClick).not.toHaveBeenCalled();
  });

  it("refuses a destination outside the affiliate domain allow-list", async () => {
    const href = `/api/track/click?p=dial-watch&t=guide&u=${encodeURIComponent(
      "https://evil.example.com/phish",
    )}&n=x`;

    const res = await GET(requestFor(href));

    expect(res.status).toBe(400);
    expect(mockPublishClick).not.toHaveBeenCalled();
  });
});
