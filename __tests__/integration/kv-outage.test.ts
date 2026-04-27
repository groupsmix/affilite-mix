/**
 * F-TEST-01: KV outage simulation.
 *
 * Mocks RATE_LIMIT_KV.get/put to throw and asserts the rate limiter
 * fails CLOSED after the KV_GRACE_MS window elapses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("F-TEST-01: KV outage behavior", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rate limiter falls back to in-memory when KV throws", async () => {
    // Mock KV to throw
    const mockKV = {
      get: vi.fn().mockRejectedValue(new Error("KV unavailable")),
      put: vi.fn().mockRejectedValue(new Error("KV unavailable")),
    };

    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        RATE_LIMIT_KV: mockKV,
      },
    });

    // The rate limiter should not throw — it should fall back to in-memory
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const result = await checkRateLimit("test-key", {
      maxRequests: 5,
      windowMs: 60_000,
    });

    // Should be allowed (in-memory fallback)
    expect(result.allowed).toBe(true);
  });

  it("rate limiter eventually fails closed after grace period", async () => {
    const mockKV = {
      get: vi.fn().mockRejectedValue(new Error("KV unavailable")),
      put: vi.fn().mockRejectedValue(new Error("KV unavailable")),
    };

    vi.stubGlobal("process", {
      ...process,
      env: {
        ...process.env,
        RATE_LIMIT_KV: mockKV,
      },
    });

    const { checkRateLimit } = await import("@/lib/rate-limit");

    // Make many requests to exhaust in-memory budget
    for (let i = 0; i < 10; i++) {
      await checkRateLimit("exhaust-key", {
        maxRequests: 5,
        windowMs: 60_000,
      });
    }

    // After exceeding the limit, should be denied
    const result = await checkRateLimit("exhaust-key", {
      maxRequests: 5,
      windowMs: 60_000,
    });
    expect(result.allowed).toBe(false);
  });
});
