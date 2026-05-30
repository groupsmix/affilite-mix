/**
 * E2-019: Chaos test — AI provider cascade failure.
 *
 * Simulates AI provider failure scenarios and verifies the system
 * degrades gracefully without crashing or leaking errors.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureExceptionMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: unknown[]) => captureExceptionMock(...args),
}));

vi.mock("@/lib/runtime-env", () => ({
  getRuntimeEnv: () => ({}),
  getAppCacheKV: () => undefined,
}));

beforeEach(() => {
  vi.resetModules();
  captureExceptionMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Chaos: AI provider cascade failure", () => {
  it("circuit breaker starts CLOSED and opens after enough failures", async () => {
    const { CircuitBreaker } = await import("@/lib/ai/circuit-breaker");

    const breaker = new CircuitBreaker("test-provider", {
      failureThreshold: 3,
      recoveryTimeoutMs: 100,
      resetTimeoutMs: 500,
    });

    expect(breaker.getState()).toBe("CLOSED");

    // Simulate failures via execute
    for (let i = 0; i < 5; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error(`fail-${i}`)));
      } catch {
        // expected
      }
    }

    // After enough failures the breaker should be OPEN
    expect(breaker.getState()).toBe("OPEN");
  });

  it("circuit breaker resets failure count on success", async () => {
    const { CircuitBreaker } = await import("@/lib/ai/circuit-breaker");

    const breaker = new CircuitBreaker("test-recovery", {
      failureThreshold: 10,
      recoveryTimeoutMs: 50,
      resetTimeoutMs: 200,
    });

    // Cause some failures (below threshold)
    try {
      await breaker.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }

    // Success should reset
    const result = await breaker.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
    expect(breaker.metrics().failures).toBe(0);
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("content moderation does not throw on empty input", async () => {
    const { containsProhibitedContent } = await import("@/lib/ai/content-moderation");

    expect(containsProhibitedContent("")).toBe(false);
    expect(containsProhibitedContent("Normal safe content about watches")).toBe(false);
  });

  it("prompt sanitization truncates oversized input without throwing", async () => {
    const { sanitizePrompt } = await import("@/lib/ai/prompt-sanitization");

    const oversized = "x".repeat(100_000);
    const result = sanitizePrompt(oversized);

    expect(result.length).toBeLessThanOrEqual(20_000);
    expect(typeof result).toBe("string");
  });
});
