import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Bug 5: per-product attribution undercount.
 *
 * The 24h dedup fingerprint and KV key used to include site_id + content_slug
 * but NOT product_slug, so a second click on a *different* product with the
 * same t / IP / UA was suppressed as a duplicate. These tests pin the fix:
 * product_slug must appear in both the fingerprint payload AND the dedup key,
 * and clicks on two different products within the window must both be recorded.
 */

// --- Mocks for every top-level import the route module pulls in -----------

vi.mock("@/lib/click-queue", () => ({
  publishClick: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/dal/products", () => ({
  getProductBySlug: vi.fn(),
}));

vi.mock("@/lib/site-context", () => ({
  getSiteIdFromHeader: vi.fn((raw: string) => raw),
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn(async (slug: string) => `db-${slug}`),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/api-error", () => ({
  apiError: vi.fn((status: number, msg: string) =>
    new Response(msg, { status }),
  ),
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

// Use the real computeHmac so the test exercises the actual HMAC pipeline.
// We only stub timingSafeEqual because the route also uses it on cache reads.
vi.mock("@/lib/internal-hmac", async () => {
  const actual = await vi.importActual<typeof import("@/lib/internal-hmac")>(
    "@/lib/internal-hmac",
  );
  return {
    ...actual,
    timingSafeEqual: vi.fn(() => true),
  };
});

vi.mock("@/lib/affiliate-domain-allowlist", () => ({
  validateAffiliateDomain: vi.fn(() => ({ allowed: true })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// In-memory KV whose behaviour matches the production CloudflareKVBinding
// surface used by isDuplicateClick: get(key) returns null when missing,
// put(key, value, { expirationTtl }) stores the value.
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

vi.mock("@/lib/hmac-key", () => ({
  getOrDeriveHmacKey: vi.fn().mockResolvedValue({} as CryptoKey),
}));

vi.mock("@/lib/security/allowed-origins", () => ({
  isOriginAllowedForSite: vi.fn(() => true),
}));

vi.mock("@/lib/auth", () => ({
  verifyToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/validation", () => ({
  isHttpsUrl: vi.fn(() => true),
}));

// ---------------------------------------------------------------------------

beforeEach(() => {
  kv = makeKv();
  vi.stubEnv("CLICK_CACHE_HMAC_KEY", "test-key-for-bug-5");
  vi.stubEnv("KV_DEDUP_WRITE_ALERT_RATE", "1000000"); // never alert in tests
});

// Scoped imports so the mocks above take effect on first evaluation.
async function loadHelpers() {
  const mod = await import("@/app/api/track/click/route");
  return {
    computeClickFingerprint: mod.computeClickFingerprint,
    isDuplicateClick: mod.isDuplicateClick,
  };
}

const FIXED_HMAC = "test-key-for-bug-5";
const UA = "Mozilla/5.0 (Macintosh) TestRunner";
const IP_PREFIX = "203.0.113";
const SITE_ID = "db-affilite-mix";

describe("Bug 5 — click dedup must include product_slug", () => {
  it("two clicks on different products with same t / IP / UA are BOTH recorded", async () => {
    const { computeClickFingerprint, isDuplicateClick } = await loadHelpers();

    const fpA = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-a",
      "review",
      IP_PREFIX,
      UA,
    );
    const resultA = await isDuplicateClick(
      fpA,
      SITE_ID,
      "product-a",
      "review",
    );
    expect(resultA).toBe("unique");

    const fpB = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-b", // <-- different product
      "review",
      IP_PREFIX,
      UA,
    );
    const resultB = await isDuplicateClick(
      fpB,
      SITE_ID,
      "product-b", // <-- different product
      "review",
    );

    // Bug 5: before the fix, resultB was "duplicate" because the dedup key
    // collapsed both products into the same bucket. After the fix, product_b
    // is its own bucket and is recorded.
    expect(resultB).toBe("unique");
    expect(fpA).not.toBe(fpB);

    // And the two fingerprints must have produced two different KV keys.
    expect(kv.put).toHaveBeenCalledTimes(2);
    const keys = kv.put.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(2);
    for (const k of keys) {
      expect(k).toMatch(/^click-dedup:/);
    }
  });

  it("a second click on the SAME product within the window is deduplicated", async () => {
    const { computeClickFingerprint, isDuplicateClick } = await loadHelpers();

    const fp = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-a",
      "review",
      IP_PREFIX,
      UA,
    );

    expect(await isDuplicateClick(fp, SITE_ID, "product-a", "review")).toBe(
      "unique",
    );
    expect(await isDuplicateClick(fp, SITE_ID, "product-a", "review")).toBe(
      "duplicate",
    );

    // Only one KV write for the first (unique) click; the second is a miss.
    expect(kv.put).toHaveBeenCalledTimes(1);
    expect(kv.get).toHaveBeenCalledTimes(2);
  });

  it("dedup key includes product_slug in the documented position", async () => {
    const { computeClickFingerprint, isDuplicateClick } = await loadHelpers();

    const fp = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-a",
      "review",
      IP_PREFIX,
      UA,
    );
    await isDuplicateClick(fp, SITE_ID, "product-a", "review");

    expect(kv.put).toHaveBeenCalledTimes(1);
    const [key] = kv.put.mock.calls[0]!;
    // Spec: click-dedup:{siteId}:{productSlug}:{contentSlug}:{fingerprint}
    expect(key).toBe(
      `click-dedup:${SITE_ID}:product-a:review:${fp}`,
    );
  });

  it("fingerprint payload changes when product_slug changes (hash sensitivity)", async () => {
    const { computeClickFingerprint } = await loadHelpers();

    const fpA = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-a",
      "review",
      IP_PREFIX,
      UA,
    );
    const fpB = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-b",
      "review",
      IP_PREFIX,
      UA,
    );
    const fpC = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-a",
      "guide", // same product, different content
      IP_PREFIX,
      UA,
    );
    const fpD = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-a",
      "review",
      IP_PREFIX,
      UA,
    );

    // Different product -> different fingerprint.
    expect(fpA).not.toBe(fpB);
    // Different content -> different fingerprint.
    expect(fpA).not.toBe(fpC);
    // Identical inputs -> identical fingerprint (deterministic).
    expect(fpA).toBe(fpD);
  });

  it("returns 'unique' (no-op) when KV is unavailable — must not crash", async () => {
    // Simulate a deployment without the KV binding (e.g. local dev).
    const { getAppCacheKV } = await import("@/lib/runtime-env");
    (getAppCacheKV as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

    const { computeClickFingerprint, isDuplicateClick } = await loadHelpers();
    const fp = await computeClickFingerprint(
      FIXED_HMAC,
      SITE_ID,
      "product-a",
      "review",
      IP_PREFIX,
      UA,
    );
    expect(await isDuplicateClick(fp, SITE_ID, "product-a", "review")).toBe(
      "unique",
    );
  });
});
