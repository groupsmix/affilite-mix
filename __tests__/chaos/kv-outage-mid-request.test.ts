/**
 * TC-04 — Chaos test: KV outage mid-request.
 *
 * Simulates KV becoming unavailable mid-request (after N successful calls)
 * and verifies the rate limiter degrades gracefully to in-memory fallback
 * within the grace window, then fails closed after the grace window expires.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureExceptionMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: any[]) => captureExceptionMock(...args),
}));

const CONFIG = { maxRequests: 5, windowMs: 60_000 };
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

describe("TC-04: KV outage mid-request chaos test", () => {
  it("degrades gracefully when KV starts throwing after N successful calls", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    const t0 = Date.UTC(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(t0);

    let callCount = 0;
    const FAIL_AFTER = 3; // KV fails after 3 successful calls

    const store = new Map<string, string>();
    const kvGet = vi.fn(async (k: string) => {
      callCount++;
      if (callCount > FAIL_AFTER) {
        throw new Error("KV upstream timeout");
      }
      const v = store.get(k);
      return v ? JSON.parse(v) : null;
    });
    const kvPut = vi.fn(async (k: string, v: string) => {
      if (callCount > FAIL_AFTER) {
        throw new Error("KV upstream timeout");
      }
      store.set(k, v);
    });
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const { checkRateLimit } = await loadModule();

    // First few calls succeed via KV
    for (let i = 0; i < FAIL_AFTER; i++) {
      const res = await checkRateLimit(`ip:chaos-${i}`, CONFIG);
      expect(res.allowed).toBe(true);
    }

    // KV is now broken — next call should fall back to memory (grace window)
    const fallbackResult = await checkRateLimit("ip:chaos-after-fail", CONFIG);
    expect(fallbackResult.allowed).toBe(true); // grace window: in-memory allows

    // Sentry alert should have fired
    const alerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context ===
        "rate-limit.kv-unavailable-fail-open",
    );
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it("fails closed after grace window when KV stays broken", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    const t0 = Date.UTC(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(t0);

    // KV always throws
    const kvGet = vi.fn().mockRejectedValue(new Error("KV down"));
    const kvPut = vi.fn().mockRejectedValue(new Error("KV down"));
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const { checkRateLimit } = await loadModule();

    // Within grace window: memory fallback
    const withinGrace = await checkRateLimit("ip:fail-closed-1", CONFIG);
    expect(withinGrace.allowed).toBe(true);

    // Advance past grace window
    vi.setSystemTime(t0 + GRACE_MS + 1);

    // Should now fail closed
    const afterGrace = await checkRateLimit("ip:fail-closed-2", CONFIG);
    expect(afterGrace.allowed).toBe(false);
    expect(afterGrace.retryAfterMs).toBeGreaterThan(0);
  });

  it("recovers from mid-request KV failure when KV comes back", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.useFakeTimers();
    const t0 = Date.UTC(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(t0);

    let shouldFail = true;

    const store = new Map<string, string>();
    const kvGet = vi.fn(async (k: string) => {
      if (shouldFail) throw new Error("KV intermittent failure");
      const v = store.get(k);
      return v ? JSON.parse(v) : null;
    });
    const kvPut = vi.fn(async (k: string, v: string) => {
      if (shouldFail) throw new Error("KV intermittent failure");
      store.set(k, v);
    });
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const { checkRateLimit } = await loadModule();

    // KV broken — falls back to memory
    const broken = await checkRateLimit("ip:recover-mid", CONFIG);
    expect(broken.allowed).toBe(true);

    // KV recovers
    shouldFail = false;

    const recovered = await checkRateLimit("ip:recover-mid", CONFIG);
    expect(recovered.allowed).toBe(true);
    // After recovery, KV put should have been called successfully
    expect(kvPut).toHaveBeenCalled();
  });

  it("in-memory limits still enforce during grace window", async () => {
    vi.stubEnv("NODE_ENV", "production");

    // KV always throws — forces in-memory fallback
    const kvGet = vi.fn().mockRejectedValue(new Error("KV gone"));
    const kvPut = vi.fn().mockRejectedValue(new Error("KV gone"));
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const smallConfig = { maxRequests: 2, windowMs: 60_000 };
    const { checkRateLimit } = await loadModule();

    // First two requests allowed (in-memory limit = 2)
    const r1 = await checkRateLimit("ip:mem-limit", smallConfig);
    expect(r1.allowed).toBe(true);
    const r2 = await checkRateLimit("ip:mem-limit", smallConfig);
    expect(r2.allowed).toBe(true);

    // Third request should be rate-limited even in memory fallback
    const r3 = await checkRateLimit("ip:mem-limit", smallConfig);
    expect(r3.allowed).toBe(false);
  });
});
