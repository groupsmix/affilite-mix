import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resetCircuitBreaker, getCircuitBreaker, CircuitOpenError } from "@/lib/ai/circuit-breaker";

// Mock dependencies
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/internal-auth", () => ({
  getInternalTokenFor: vi.fn().mockReturnValue("test-token"),
}));

vi.mock("@/lib/internal-hmac", () => ({
  verifyInternalHmac: vi.fn().mockResolvedValue({ valid: true }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/dal/type-guards", () => ({
  untypedFrom: vi.fn().mockReturnValue({
    insert: vi.fn().mockReturnValue({
      unsafeNoSiteFilter: vi.fn().mockResolvedValue({ error: null }),
    }),
  }),
}));

describe("S9-H2: Click queue circuit breaker backpressure", () => {
  beforeEach(() => {
    vi.resetModules();
    resetCircuitBreaker("supabase-clicks");
  });

  afterEach(() => {
    resetCircuitBreaker("supabase-clicks");
  });

  it("should use a circuit breaker with failureThreshold=3 and recoveryTimeoutMs=15000", () => {
    const breaker = getCircuitBreaker("supabase-clicks", {
      failureThreshold: 3,
      recoveryTimeoutMs: 15_000,
    });
    expect(breaker.name).toBe("supabase-clicks");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should open the circuit after 3 consecutive failures", async () => {
    const breaker = getCircuitBreaker("supabase-clicks", {
      failureThreshold: 3,
      recoveryTimeoutMs: 15_000,
    });

    // Simulate 3 failures
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("Supabase connection timeout");
        });
      } catch {
        // expected
      }
    }

    expect(breaker.getState()).toBe("OPEN");
  });

  it("should throw CircuitOpenError when circuit is open", async () => {
    const breaker = getCircuitBreaker("supabase-clicks", {
      failureThreshold: 3,
      recoveryTimeoutMs: 15_000,
    });

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }
    }

    await expect(breaker.execute(async () => "should not run")).rejects.toThrow(CircuitOpenError);
  });

  it("should reset to CLOSED after a successful call following recovery", async () => {
    const breaker = getCircuitBreaker("supabase-clicks", {
      failureThreshold: 3,
      recoveryTimeoutMs: 50, // short timeout for test
    });

    // Trip the breaker
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }
    }
    expect(breaker.getState()).toBe("OPEN");

    // Wait for recovery timeout
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Should transition to HALF_OPEN and allow one probe
    const result = await breaker.execute(async () => "success");
    expect(result).toBe("success");
    expect(breaker.getState()).toBe("CLOSED");
  });

  it("should count Supabase error responses as failures for the breaker", async () => {
    const breaker = getCircuitBreaker("supabase-clicks", {
      failureThreshold: 3,
      recoveryTimeoutMs: 15_000,
    });

    // Simulate the pattern used in the route: throw on Supabase error
    const simulateUpsert = async () => {
      const result = { error: { message: "connection pool exhausted" } };
      if (result.error) {
        throw new Error(result.error.message);
      }
    };

    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(simulateUpsert);
      } catch {
        // expected
      }
    }

    expect(breaker.getState()).toBe("OPEN");
  });

  it("CircuitOpenError has correct name and message", () => {
    const err = new CircuitOpenError("supabase-clicks");
    expect(err.name).toBe("CircuitOpenError");
    expect(err.message).toContain("supabase-clicks");
    expect(err instanceof Error).toBe(true);
  });
});
