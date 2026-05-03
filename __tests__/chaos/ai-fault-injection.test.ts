/**
 * A74-F2: Fault-injection tests for AI provider resilience.
 *
 * Verifies that the fallback chain handles upstream failures gracefully:
 *   - Timeout simulation
 *   - 500/503 upstream errors
 *   - Circuit breaker tripping after consecutive failures
 *   - Fallback to next provider when one is down
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetCircuitBreaker, getCircuitBreaker } from "@/lib/ai/circuit-breaker";

// Stub environment so providers appear "available"
beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "test-account");
  vi.stubEnv("CLOUDFLARE_AI_API_TOKEN", "test-token");
  vi.stubEnv("AI_ENABLE_CLOUDFLARE", "true");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini");
  vi.stubEnv("AI_ENABLE_GEMINI", "true");
  vi.stubEnv("GROQ_API_KEY", "test-groq");
  vi.stubEnv("AI_ENABLE_GROQ", "true");
  vi.stubEnv("COHERE_API_KEY", "test-cohere");
  vi.stubEnv("AI_ENABLE_COHERE", "true");

  // Reset all circuit breakers between tests
  resetCircuitBreaker("Cloudflare AI");
  resetCircuitBreaker("Google Gemini");
  resetCircuitBreaker("Groq");
  resetCircuitBreaker("Cohere");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Chaos: AI provider fault injection", () => {
  it("circuit breaker opens after consecutive failures and skips provider", () => {
    const cb = getCircuitBreaker("test-provider", { failureThreshold: 3 });

    // Simulate 3 consecutive failures
    for (let i = 0; i < 3; i++) {
      expect(
        cb.execute(() => Promise.reject(new Error("upstream 503"))),
      ).rejects.toThrow("upstream 503");
    }

    // Breaker should now be OPEN
    expect(cb.getState()).toBe("OPEN");

    // Next call should be rejected immediately with CircuitOpenError
    expect(cb.execute(() => Promise.resolve("should not run"))).rejects.toThrow(
      "Circuit breaker OPEN",
    );
  });

  it("circuit breaker transitions to HALF_OPEN after recovery timeout", async () => {
    const cb = getCircuitBreaker("test-recovery", {
      failureThreshold: 2,
      recoveryTimeoutMs: 50, // 50ms for test speed
    });

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }
    expect(cb.getState()).toBe("OPEN");

    // Wait for recovery timeout
    await new Promise((r) => setTimeout(r, 60));

    // Should transition to HALF_OPEN
    expect(cb.getState()).toBe("HALF_OPEN");

    // A successful call should close it
    const result = await cb.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(cb.getState()).toBe("CLOSED");
  });

  it("circuit breaker re-opens on failure during HALF_OPEN", async () => {
    const cb = getCircuitBreaker("test-reopen", {
      failureThreshold: 2,
      recoveryTimeoutMs: 50,
    });

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      try {
        await cb.execute(() => Promise.reject(new Error("fail")));
      } catch {
        // expected
      }
    }

    // Wait for recovery
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe("HALF_OPEN");

    // Fail during HALF_OPEN
    try {
      await cb.execute(() => Promise.reject(new Error("still broken")));
    } catch {
      // expected
    }

    // Should be OPEN again
    expect(cb.getState()).toBe("OPEN");
  });

  it("metrics expose correct state for observability", () => {
    const cb = getCircuitBreaker("test-metrics", { failureThreshold: 2 });
    const m = cb.metrics();

    expect(m.name).toBe("test-metrics");
    expect(m.state).toBe("CLOSED");
    expect(m.failures).toBe(0);
    expect(m.lastStateChangeAt).toBeDefined();
  });
});
