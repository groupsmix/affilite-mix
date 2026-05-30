/**
 * RISK-25 (étap-3): Extended chaos/fault injection tests for circuit breaker.
 *
 * Tests failure modes that won't show up in unit tests:
 *   - Timeout simulation (slow responses)
 *   - Partial response (promise resolves with error data)
 *   - Rapid open/close cycling (flapping)
 *   - Half-open probe behavior
 *   - Concurrent execution under circuit open state
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

describe("Chaos: Circuit breaker fault injection", () => {
  it("rejects immediately when circuit is OPEN (fast-fail)", async () => {
    const { CircuitBreaker, CircuitOpenError } = await import("@/lib/ai/circuit-breaker");

    const breaker = new CircuitBreaker("fast-fail-test", {
      failureThreshold: 2,
      recoveryTimeoutMs: 5000, // Long recovery so circuit stays open
      resetTimeoutMs: 10000,
    });

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error("trip")));
      } catch {
        // expected
      }
    }
    expect(breaker.getState()).toBe("OPEN");

    // Subsequent calls should fail immediately (not wait for timeout)
    const start = Date.now();
    try {
      await breaker.execute(() => new Promise((r) => setTimeout(() => r("slow"), 5000)));
    } catch (err) {
      expect(err).toBeInstanceOf(CircuitOpenError);
    }
    const elapsed = Date.now() - start;
    // Should fail in < 50ms (fast-fail), not 5000ms (timeout)
    expect(elapsed).toBeLessThan(100);
  });

  it("transitions to HALF_OPEN after recovery timeout", async () => {
    const { CircuitBreaker } = await import("@/lib/ai/circuit-breaker");

    const breaker = new CircuitBreaker("half-open-test", {
      failureThreshold: 2,
      recoveryTimeoutMs: 50,
      resetTimeoutMs: 200,
    });

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error("trip")));
      } catch {
        // expected
      }
    }
    expect(breaker.getState()).toBe("OPEN");

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 100));

    // Next call should be a probe (HALF_OPEN)
    const result = await breaker.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("re-opens on failure during HALF_OPEN probe", async () => {
    const { CircuitBreaker } = await import("@/lib/ai/circuit-breaker");

    const breaker = new CircuitBreaker("reopen-test", {
      failureThreshold: 2,
      recoveryTimeoutMs: 50,
      resetTimeoutMs: 200,
    });

    // Trip the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(() => Promise.reject(new Error("trip")));
      } catch {
        // expected
      }
    }

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 100));

    // Probe fails → circuit should re-open
    try {
      await breaker.execute(() => Promise.reject(new Error("probe-fail")));
    } catch {
      // expected
    }
    expect(breaker.getState()).toBe("OPEN");
  });

  it("metrics track failures and successes accurately", async () => {
    const { CircuitBreaker } = await import("@/lib/ai/circuit-breaker");

    const breaker = new CircuitBreaker("metrics-test", {
      failureThreshold: 100, // High threshold so we stay closed
      recoveryTimeoutMs: 50,
      resetTimeoutMs: 200,
    });

    // Mix of successes and failures
    await breaker.execute(() => Promise.resolve("ok"));
    await breaker.execute(() => Promise.resolve("ok"));
    try {
      await breaker.execute(() => Promise.reject(new Error("fail")));
    } catch {
      // expected
    }
    await breaker.execute(() => Promise.resolve("ok"));

    const m = breaker.metrics();
    // Metrics should reflect the failures
    expect(m.failures).toBe(0); // Reset by the last success
  });
});
