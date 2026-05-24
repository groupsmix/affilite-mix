/**
 * Per-tenant quota primitive tests (G-42).
 *
 * Exercises `lib/quotas.ts` against an in-memory KV mock so the module
 * can be tested without a Cloudflare Worker runtime.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

interface MockKVEntry {
  value: string;
  ttl?: number;
}

function makeMockKV(): { kv: Record<string, MockKVEntry>; binding: unknown } {
  const kv: Record<string, MockKVEntry> = {};
  const binding = {
    async get(key: string, type?: string) {
      const entry = kv[key];
      if (!entry) return null;
      if (type === "json") {
        try {
          return JSON.parse(entry.value);
        } catch {
          return null;
        }
      }
      return entry.value;
    },
    async put(key: string, value: string, opts?: { expirationTtl?: number }) {
      kv[key] = { value, ttl: opts?.expirationTtl };
    },
  };
  return { kv, binding };
}

describe("lib/quotas — per-tenant ceilings", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    vi.resetModules();
    savedEnv = {
      QUOTA_DEFAULT_AI_TOKENS_PER_MONTH: process.env.QUOTA_DEFAULT_AI_TOKENS_PER_MONTH,
      QUOTA_DEFAULT_AI_REQUESTS_PER_DAY: process.env.QUOTA_DEFAULT_AI_REQUESTS_PER_DAY,
      QUOTA_DEFAULT_R2_STORAGE_BYTES: process.env.QUOTA_DEFAULT_R2_STORAGE_BYTES,
    };
    delete process.env.QUOTA_DEFAULT_AI_TOKENS_PER_MONTH;
    delete process.env.QUOTA_DEFAULT_AI_REQUESTS_PER_DAY;
    delete process.env.QUOTA_DEFAULT_R2_STORAGE_BYTES;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns unlimited when no overrides or env defaults are configured", async () => {
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const { checkQuota } = await import("@/lib/quotas");
    const result = await checkQuota("site-x", "ai_tokens", 1_000_000);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBeUndefined();
    expect(result.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it("uses the env default when no site override is set", async () => {
    process.env.QUOTA_DEFAULT_AI_REQUESTS_PER_DAY = "5";
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const { checkQuota, recordUsage } = await import("@/lib/quotas");

    // Burn 4 of the 5 daily requests.
    for (let i = 0; i < 4; i++) await recordUsage("site-x", "ai_requests", 1);

    const ok = await checkQuota("site-x", "ai_requests", 1);
    expect(ok.allowed).toBe(true);
    expect(ok.limit).toBe(5);
    expect(ok.remaining).toBe(0);

    await recordUsage("site-x", "ai_requests", 1);

    const blocked = await checkQuota("site-x", "ai_requests", 1);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("assertQuota throws QuotaExceededError when over the ceiling", async () => {
    process.env.QUOTA_DEFAULT_AI_TOKENS_PER_MONTH = "100";
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const { assertQuota, QuotaExceededError, recordUsage } = await import("@/lib/quotas");

    await recordUsage("site-x", "ai_tokens", 80);
    await expect(assertQuota("site-x", "ai_tokens", 50)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it("fails OPEN when KV is unavailable so accounting outages don't brick callers", async () => {
    process.env.QUOTA_DEFAULT_AI_REQUESTS_PER_DAY = "1";
    // No KV binding stubbed — getKVNamespace returns undefined.

    const { checkQuota } = await import("@/lib/quotas");
    const result = await checkQuota("site-x", "ai_requests", 1);
    // Counter reads as 0 when KV is missing, so allowed.
    expect(result.allowed).toBe(true);
    expect(result.usage).toBe(0);
  });

  it("uses month/day/cumulative window keys per resource", async () => {
    process.env.QUOTA_DEFAULT_AI_TOKENS_PER_MONTH = "1000";
    process.env.QUOTA_DEFAULT_AI_REQUESTS_PER_DAY = "1000";
    process.env.QUOTA_DEFAULT_R2_STORAGE_BYTES = "1000";
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const { checkQuota } = await import("@/lib/quotas");
    const monthly = await checkQuota("s", "ai_tokens", 1);
    const daily = await checkQuota("s", "ai_requests", 1);
    const cumulative = await checkQuota("s", "r2_storage_bytes", 1);

    expect(monthly.window).toBe("month");
    expect(monthly.windowKey).toMatch(/^\d{4}-\d{2}$/);
    expect(daily.window).toBe("day");
    expect(daily.windowKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(cumulative.window).toBe("cumulative");
    expect(cumulative.windowKey).toBe("cumulative");
  });

  it("estimateTokens approximates 4 chars per token for Latin text", async () => {
    const { estimateTokens, costToMicroUsd } = await import("@/lib/quotas");
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
    expect(costToMicroUsd(0.000123)).toBe(123);
    expect(costToMicroUsd(-1)).toBe(0);
  });

  it("estimateTokens uses chars/3 for non-Latin text (A114-F2)", async () => {
    const { estimateTokens } = await import("@/lib/quotas");
    // Arabic text (>30% non-Latin) should use chars/3 ratio
    const arabicText = "مرحبا بالعالم هذا نص عربي طويل بما فيه الكفاية"; // Arabic text
    const result = estimateTokens(arabicText);
    const expectedWithChars3 = Math.ceil(arabicText.length / 3);
    expect(result).toBe(expectedWithChars3);

    // Mixed text with <30% non-Latin should still use chars/4
    const mostlyLatin = "This is mostly English text with a few Arabic words مرحبا";
    const latinResult = estimateTokens(mostlyLatin);
    const expectedWithChars4 = Math.ceil(mostlyLatin.length / 4);
    expect(latinResult).toBe(expectedWithChars4);
  });

  it("getUsageSnapshot returns counters for every resource", async () => {
    process.env.QUOTA_DEFAULT_AI_TOKENS_PER_MONTH = "10";
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const { getUsageSnapshot, recordUsage } = await import("@/lib/quotas");
    await recordUsage("site-x", "ai_tokens", 7);
    await recordUsage("site-x", "r2_storage_bytes", 12345);

    const snap = await getUsageSnapshot("site-x");
    expect(snap.usage.ai_tokens).toBe(7);
    expect(snap.usage.r2_storage_bytes).toBe(12345);
    expect(snap.usage.ai_requests).toBe(0);
    expect(snap.limits.ai_tokens).toBe(10);
    expect(snap.limits.r2_storage_bytes).toBeUndefined();
  });

  it("rejects negative or non-finite increments", async () => {
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const { checkQuota } = await import("@/lib/quotas");
    await expect(checkQuota("s", "ai_tokens", -1)).rejects.toThrow();
    await expect(checkQuota("s", "ai_tokens", Number.NaN)).rejects.toThrow();
  });

  it("recordUsage credits negative amounts back to the counter", async () => {
    process.env.QUOTA_DEFAULT_R2_STORAGE_BYTES = "1000";
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const { checkQuota, recordUsage, getUsageSnapshot } = await import("@/lib/quotas");

    // Pessimistic accounting: presign records bytes upfront.
    await recordUsage("site-x", "r2_storage_bytes", 800);
    let snap = await getUsageSnapshot("site-x");
    expect(snap.usage.r2_storage_bytes).toBe(800);

    // Reconciliation: upload never completed → credit the bytes back.
    await recordUsage("site-x", "r2_storage_bytes", -800);
    snap = await getUsageSnapshot("site-x");
    expect(snap.usage.r2_storage_bytes).toBe(0);

    // Counter is usable again after the credit.
    const ok = await checkQuota("site-x", "r2_storage_bytes", 800);
    expect(ok.allowed).toBe(true);
    expect(ok.remaining).toBe(200);
  });

  it("recordUsage clamps the counter at zero on over-credit and emits a Sentry breadcrumb", async () => {
    const { binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const captureMessage = vi.fn();
    vi.doMock("@/lib/sentry", async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown>;
      return { ...actual, captureMessage };
    });

    const { recordUsage, getUsageSnapshot } = await import("@/lib/quotas");

    await recordUsage("site-x", "r2_storage_bytes", 100);
    // Stray over-credit (e.g. duplicate finalize signal) must not push
    // the counter below zero — that would silently grant extra capacity.
    await recordUsage("site-x", "r2_storage_bytes", -250);

    const snap = await getUsageSnapshot("site-x");
    expect(snap.usage.r2_storage_bytes).toBe(0);
    expect(captureMessage).toHaveBeenCalledTimes(1);
    expect(captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("over-credit clamped to zero"),
      "warning",
    );
  });

  it("recordUsage is a no-op for zero amounts (no KV write, no breadcrumb)", async () => {
    const { kv, binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const captureMessage = vi.fn();
    vi.doMock("@/lib/sentry", async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown>;
      return { ...actual, captureMessage };
    });

    const { recordUsage, getUsageSnapshot } = await import("@/lib/quotas");

    await recordUsage("site-x", "ai_tokens", 0);

    expect(Object.keys(kv)).toHaveLength(0);
    expect(captureMessage).not.toHaveBeenCalled();
    const snap = await getUsageSnapshot("site-x");
    expect(snap.usage.ai_tokens).toBe(0);
  });

  it("recordUsage warns and short-circuits on non-finite amounts", async () => {
    const { kv, binding } = makeMockKV();
    vi.stubGlobal("RATE_LIMIT_KV", binding);

    const captureMessage = vi.fn();
    vi.doMock("@/lib/sentry", async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown>;
      return { ...actual, captureMessage };
    });

    const { recordUsage } = await import("@/lib/quotas");

    await recordUsage("site-x", "ai_tokens", Number.NaN);
    await recordUsage("site-x", "ai_tokens", Number.POSITIVE_INFINITY);
    await recordUsage("site-x", "ai_tokens", Number.NEGATIVE_INFINITY);

    expect(Object.keys(kv)).toHaveLength(0);
    expect(captureMessage).toHaveBeenCalledTimes(3);
    expect(captureMessage).toHaveBeenLastCalledWith(
      expect.stringContaining("non-finite amount"),
      "warning",
    );
  });
});
