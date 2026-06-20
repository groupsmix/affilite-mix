import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Bug 5: per-product attribution undercount.
 *
 * The 24h dedup fingerprint and KV key used to include site_id + content_slug
 * but NOT product_slug, so a second click on a *different* product with the
 * same t / IP / UA was suppressed as a duplicate.
 *
 * These tests pin the fix by driving the public route handler (black-box).
 * The dedup helpers (computeClickFingerprint / isDuplicateClick) stay PRIVATE
 * to route.ts on purpose: Next.js rejects any non-handler export from a route
 * module at build time, so exporting them to test directly breaks `next build`.
 *
 * Assertions follow the bug spec:
 *   - two different `p` values, same t / IP / UA, within the window  → BOTH recorded
 *   - the same `p` twice within the window                          → second is deduped
 *   - the dedup key carries product_slug in the documented position
 */

// --- Mocks for the route module's top-level imports -----------------------

const mockPublishClick = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/click-queue", () => ({
  publishClick: (...args: unknown[]) => mockPublishClick(...args),
}));

vi.mock("@/lib/dal/products", () => ({
  getProductBySlug: vi.fn(async (_siteId: string, slug: string) => ({
    name: `Product ${slug}`,
    affiliate_url: `https://affiliate.example.com/${slug}`,
  })),
}));

vi.mock("@/lib/site-context", () => ({
  getSiteIdFromHeader: vi.fn((raw: string) => raw),
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn(async (slug: string) => `db-${slug}`),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 59, retryAfterMs: 0 }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn(() => "203.0.113.7"),
  getIpPrefix: vi.fn(() => "203.0.113"),
}));

vi.mock("@/lib/wait-until", () => ({
  runAfterResponse: vi.fn(),
}));

// Use the real computeHmac so fingerprints are genuinely derived from the
// inputs (including product_slug). Only timingSafeEqual is stubbed, because
// the route also calls it when validating the product-url cache.
vi.mock("@/lib/internal-hmac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/internal-hmac")>("@/lib/internal-hmac");
  return { ...actual, timingSafeEqual: vi.fn(() => true) };
});

vi.mock("@/lib/affiliate-domain-allowlist", () => ({
  validateAffiliateDomain: vi.fn(() => ({
    allowed: true,
    domain: "affiliate.example.com",
    reason: null,
  })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/hmac-key", () => ({
  getOrDeriveHmacKey: vi.fn().mockResolvedValue({} as CryptoKey),
}));

vi.mock("@/lib/auth", () => ({
  verifyToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/validation", () => ({
  isHttpsUrl: vi.fn(() => true),
}));

// In-memory KV mirroring the CloudflareKV surface the route relies on:
//   get(key)         -> string | null         (dedup reads)
//   get(key, "json") -> parsed object | null  (product-url cache reads)
//   put(key, value)  -> stores the value
function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string, type?: string) => {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === "json" ? JSON.parse(v) : v;
    }),
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

// Imported after the mocks above so they take effect on first evaluation.
import { GET } from "@/app/api/track/click/route";

const UA = "Mozilla/5.0 (Macintosh) TestRunner";

// A trusted top-level navigation (Sec-Fetch-Site: none / Dest: document) so
// the analytics + dedup path runs inside the GET handler.
function clickRequest(productSlug: string, contentSlug: string): NextRequest {
  const url = `https://test.example.com/api/track/click?p=${productSlug}&t=${contentSlug}`;
  return new NextRequest(url, {
    method: "GET",
    headers: {
      "x-site-id": "affilite-mix",
      "user-agent": UA,
      "sec-fetch-site": "none",
      "sec-fetch-dest": "document",
    },
  });
}

// The dedup writes are the click-dedup:* KV puts. The product-url cache shares
// the same mock, so we filter puts by prefix.
function dedupKeys(): string[] {
  return kv.put.mock.calls.map((c) => String(c[0])).filter((k) => k.startsWith("click-dedup:"));
}

beforeEach(async () => {
  kv = makeKv();
  mockPublishClick.mockClear();
  // Re-establish the default KV provider each test (one test overrides it).
  const { getAppCacheKV } = await import("@/lib/runtime-env");
  (getAppCacheKV as ReturnType<typeof vi.fn>).mockImplementation(() => kv);
  vi.stubEnv("CLICK_CACHE_HMAC_KEY", "test-key-for-bug-5");
  vi.stubEnv("KV_DEDUP_WRITE_ALERT_RATE", "1000000"); // never alert in tests
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Bug 5 — click dedup must include product_slug", () => {
  it("two clicks on different products with same t / IP / UA are BOTH recorded", async () => {
    const resA = await GET(clickRequest("product-a", "review"));
    const resB = await GET(clickRequest("product-b", "review"));

    expect(resA.status).toBe(302);
    expect(resB.status).toBe(302);

    // Before the fix, product-b collapsed into product-a's bucket and was
    // suppressed as a duplicate. After the fix both clicks are recorded.
    expect(mockPublishClick).toHaveBeenCalledTimes(2);

    const keys = dedupKeys();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(keys.some((k) => k.includes(":product-a:"))).toBe(true);
    expect(keys.some((k) => k.includes(":product-b:"))).toBe(true);
  });

  it("a second click on the SAME product within the window is deduplicated", async () => {
    const first = await GET(clickRequest("product-a", "review"));
    const second = await GET(clickRequest("product-a", "review"));

    expect(first.status).toBe(302);
    expect(second.status).toBe(302);

    // Only the first click is recorded; the second hits the 24h dedup window.
    expect(mockPublishClick).toHaveBeenCalledTimes(1);
    expect(dedupKeys()).toHaveLength(1);
  });

  it("writes the dedup key with product_slug in the documented position", async () => {
    await GET(clickRequest("product-a", "review"));

    const keys = dedupKeys();
    expect(keys).toHaveLength(1);
    // Spec key shape: click-dedup:{siteId}:{productSlug}:{contentSlug}:{fingerprint}
    expect(keys[0]).toMatch(/^click-dedup:db-affilite-mix:product-a:review:.+$/);
  });

  it("does not collapse clicks that differ only by content_slug", async () => {
    await GET(clickRequest("product-a", "review"));
    await GET(clickRequest("product-a", "guide"));

    expect(mockPublishClick).toHaveBeenCalledTimes(2);
    expect(new Set(dedupKeys()).size).toBe(2);
  });

  it("still redirects and records when KV is unavailable (no crash)", async () => {
    const { getAppCacheKV } = await import("@/lib/runtime-env");
    (getAppCacheKV as ReturnType<typeof vi.fn>).mockReturnValue(null);

    const res = await GET(clickRequest("product-a", "review"));

    expect(res.status).toBe(302);
    expect(mockPublishClick).toHaveBeenCalledTimes(1);
  });
});
