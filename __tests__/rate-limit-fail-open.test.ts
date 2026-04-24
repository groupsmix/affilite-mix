/**
 * F-3 — KV unavailable fail-open grace-window behaviour.
 *
 * In production, when RATE_LIMIT_KV is missing or its operations throw,
 * the rate limiter must fall back to the in-memory limiter for a
 * 60-second grace window, then fail closed. In development, it must
 * keep the existing memory fallback without failing closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureExceptionMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
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

describe("F-3 KV unavailability — production fail-open grace", () => {
  it("falls back to in-memory limiter within the grace window when KV binding is missing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubEnv("NODE_ENV", "production");

    const { checkRateLimit } = await loadModule();

    const first = await checkRateLimit("ip:grace-1", CONFIG);
    const second = await checkRateLimit("ip:grace-1", CONFIG);
    const third = await checkRateLimit("ip:grace-1", CONFIG);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    // Third call hits the in-memory limiter's cap (2), not the fail-closed path.
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);

    // A Sentry alert must be fired exactly once for entering the grace window.
    const graceAlerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context === "rate-limit.kv-grace-open",
    );
    expect(graceAlerts).toHaveLength(1);
  });

  it("fails closed after the 60s grace window expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubEnv("NODE_ENV", "production");

    const { checkRateLimit } = await loadModule();

    // First request — KV missing, grace window begins.
    const inGrace = await checkRateLimit("ip:expired-1", CONFIG);
    expect(inGrace.allowed).toBe(true);

    // Jump past the 60s grace window.
    vi.setSystemTime(new Date("2026-01-01T00:01:01Z"));

    const expired = await checkRateLimit("ip:expired-1", CONFIG);
    expect(expired.allowed).toBe(false);
    expect(expired.retryAfterMs).toBe(60_000);

    const expiredAlerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context === "rate-limit.kv-grace-expired",
    );
    expect(expiredAlerts).toHaveLength(1);
  });

  it("resets the grace window when KV recovers mid-session", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubEnv("NODE_ENV", "production");

    const { checkRateLimit } = await loadModule();

    // KV missing — grace window opens.
    const openCall = await checkRateLimit("ip:recover-1", CONFIG);
    expect(openCall.allowed).toBe(true);

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

    // KV breaks again, well after the original grace window would have expired.
    vi.setSystemTime(new Date("2026-01-01T00:05:00Z"));
    vi.unstubAllGlobals();

    // A new grace window should open — the call must not fail closed.
    const reopened = await checkRateLimit("ip:recover-2", CONFIG);
    expect(reopened.allowed).toBe(true);
  });

  it("treats KV.get throwing as an availability failure and falls back to the grace path", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubEnv("NODE_ENV", "production");

    const kvGet = vi.fn().mockRejectedValue(new Error("KV upstream 500"));
    const kvPut = vi.fn();
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const { checkRateLimit } = await loadModule();

    const res = await checkRateLimit("ip:kv-throw", CONFIG);
    expect(res.allowed).toBe(true);
    expect(kvGet).toHaveBeenCalled();

    const graceAlerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context === "rate-limit.kv-grace-open",
    );
    expect(graceAlerts).toHaveLength(1);
  });

  it("falls back to in-memory indefinitely in non-production even past the grace window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    vi.stubEnv("NODE_ENV", "development");

    const { checkRateLimit } = await loadModule();

    const first = await checkRateLimit("ip:dev-1", CONFIG);
    expect(first.allowed).toBe(true);

    vi.setSystemTime(new Date("2026-01-01T00:05:00Z"));

    const later = await checkRateLimit("ip:dev-1", CONFIG);
    expect(later.allowed).toBe(true);

    // No grace-expired alert in dev.
    const expiredAlerts = captureExceptionMock.mock.calls.filter(
      ([, ctx]) =>
        (ctx as { context?: string } | undefined)?.context === "rate-limit.kv-grace-expired",
    );
    expect(expiredAlerts).toHaveLength(0);
  });
});
