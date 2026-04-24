/**
 * F-3 — KV unavailable behaviour.
 *
 * In production, when RATE_LIMIT_KV is missing or its operations throw,
 * the rate limiter must fail closed immediately. In development, it must
 * fall back to the in-memory limiter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureExceptionMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: any[]) => captureExceptionMock(...args),
}));

const CONFIG = { maxRequests: 2, windowMs: 60_000 };

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
  it("fails open gracefully when KV binding is missing in production", async () => {
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

    // Second call should also fail closed, but not alert again
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

  it("fails open gracefully when KV.get throws in production", async () => {
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

  it("recovers when KV becomes available again mid-session", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const { checkRateLimit } = await loadModule();

    // KV missing — fails closed.
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

    // Should fail closed and alert again since state was reset
    const brokenAgain = await checkRateLimit("ip:recover-2", CONFIG);
    expect(brokenAgain.allowed).toBe(true);

    const alerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context ===
        "rate-limit.kv-unavailable-fail-open",
    );
    expect(alerts).toHaveLength(2); // One from before, one from now
  });

  it("falls back to in-memory in non-production", async () => {
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
