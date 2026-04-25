/**
 * F-3 — KV unavailable behaviour.
 *
 * In production, when RATE_LIMIT_KV is missing or its operations throw,
 * the rate limiter falls back to the per-isolate in-memory limiter for
 * KV_GRACE_MS, then fails CLOSED. In development, it falls back to the
 * in-memory limiter indefinitely.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureExceptionMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: any[]) => captureExceptionMock(...args),
}));

const CONFIG = { maxRequests: 2, windowMs: 60_000 };
const GRACE_MS = 60_000;

async function loadModule() {
  const mod = await import("@/lib/rate-limit");
  mod.__resetRateLimitKvStateForTests();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  captureExceptionMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("F-3 KV unavailability", () => {
  it("falls back to memory within grace window when KV is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { checkRateLimit } = await loadModule();

    const result = await checkRateLimit("ip:missing-1", CONFIG);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
    expect(result.retryAfterMs).toBe(0);

    // A Sentry alert must be fired exactly once
    const alerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context ===
        "rate-limit.kv-unavailable-fail-open",
    );
    expect(alerts).toHaveLength(1);

    // A second call still within the grace window must also be allowed,
    // and must NOT alert again (alert is per-state, not per-call).
    const result2 = await checkRateLimit("ip:missing-1", CONFIG);
    expect(result2.allowed).toBe(true);
    expect(
      captureExceptionMock.mock.calls.filter(
        ([, ctx]) =>
          (ctx as { context?: string } | undefined)?.context ===
          "rate-limit.kv-unavailable-fail-open",
      ),
    ).toHaveLength(1);
  });

  it("fails CLOSED after grace window elapses without KV recovering", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    const start = Date.UTC(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(start);

    const { checkRateLimit } = await loadModule();

    // First call: KV missing → memory fallback inside the grace window.
    const within = await checkRateLimit("ip:grace", CONFIG);
    expect(within.allowed).toBe(true);

    // Advance past the grace window.
    vi.setSystemTime(start + GRACE_MS + 1);

    const expired = await checkRateLimit("ip:grace", CONFIG);
    expect(expired.allowed).toBe(false);
    expect(expired.remaining).toBe(0);
    expect(expired.retryAfterMs).toBeGreaterThan(0);

    // A subsequent call should also fail closed.
    const expired2 = await checkRateLimit("ip:grace-2", CONFIG);
    expect(expired2.allowed).toBe(false);
  });

  it("falls back to memory within grace window when KV.get throws", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const kvGet = vi.fn().mockRejectedValue(new Error("KV upstream 500"));
    const kvPut = vi.fn();
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const { checkRateLimit } = await loadModule();

    const res = await checkRateLimit("ip:kv-throw", CONFIG);
    expect(res.allowed).toBe(true);
    expect(kvGet).toHaveBeenCalled();

    const alerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context ===
        "rate-limit.kv-unavailable-fail-open",
    );
    expect(alerts).toHaveLength(1);
  });

  it("recovers when KV becomes available again mid-session and re-arms grace on the next outage", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    const t0 = Date.UTC(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(t0);

    const { checkRateLimit } = await loadModule();

    // KV missing — memory fallback inside grace.
    const missingCall = await checkRateLimit("ip:recover-1", CONFIG);
    expect(missingCall.allowed).toBe(true);

    // KV comes back. Bind it on globalThis so the module picks it up.
    const store = new Map<string, string>();
    const kvGet = vi.fn(async (k: string) => {
      const v = store.get(k);
      return v ? JSON.parse(v) : null;
    });
    const kvPut = vi.fn(async (k: string, v: string) => {
      store.set(k, v);
    });
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const kvCall = await checkRateLimit("ip:recover-1", CONFIG);
    expect(kvCall.allowed).toBe(true);
    expect(kvGet).toHaveBeenCalled();
    expect(kvPut).toHaveBeenCalled();

    // KV breaks again
    vi.unstubAllGlobals();

    // Even if a long time has passed since the *first* outage, the
    // grace window is per-outage — recovery resets it.
    vi.setSystemTime(t0 + 5 * GRACE_MS);

    const brokenAgain = await checkRateLimit("ip:recover-2", CONFIG);
    expect(brokenAgain.allowed).toBe(true);

    const alerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context ===
        "rate-limit.kv-unavailable-fail-open",
    );
    expect(alerts).toHaveLength(2); // One from before, one from now
  });

  it("falls back to in-memory in non-production indefinitely", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const { checkRateLimit } = await loadModule();

    const first = await checkRateLimit("ip:dev-1", CONFIG);
    const second = await checkRateLimit("ip:dev-1", CONFIG);
    const third = await checkRateLimit("ip:dev-1", CONFIG);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false); // Hit in-memory limit

    const alerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context ===
        "rate-limit.kv-unavailable-fail-open",
    );
    expect(alerts).toHaveLength(0);
  });
});
