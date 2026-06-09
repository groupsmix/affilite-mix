import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
  getCircuitBreaker,
  resetCircuitBreaker,
} from "@/lib/ai/circuit-breaker";

// Mock the runtime-env module to control KV availability
const mockKV = {
  get: vi.fn().mockResolvedValue(null),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@/lib/runtime-env", () => ({
  getAppCacheKV: vi.fn(() => mockKV),
}));

describe("S9-C2: KV-backed fleet-wide circuit breaker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCircuitBreaker("test-provider");
    mockKV.get.mockResolvedValue(null);
    mockKV.put.mockResolvedValue(undefined);
    mockKV.delete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetCircuitBreaker("test-provider");
  });

  it("should check KV for fleet-wide OPEN state before executing", async () => {
    const breaker = new CircuitBreaker("test-provider", { failureThreshold: 3 });

    await breaker.execute(async () => "ok");

    expect(mockKV.get).toHaveBeenCalledWith("cb:test-provider", "json");
  });

  it("should throw CircuitOpenError when KV reports fleet-wide OPEN", async () => {
    mockKV.get.mockResolvedValue({
      state: "OPEN",
      until: Date.now() + 30_000,
    });

    const breaker = new CircuitBreaker("test-provider", { failureThreshold: 3 });

    await expect(breaker.execute(async () => "should not run")).rejects.toThrow(CircuitOpenError);
  });

  it("should NOT throw when KV OPEN state has expired", async () => {
    mockKV.get.mockResolvedValue({
      state: "OPEN",
      until: Date.now() - 1000, // expired
    });

    const breaker = new CircuitBreaker("test-provider", { failureThreshold: 3 });

    const result = await breaker.execute(async () => "ok");
    expect(result).toBe("ok");
  });

  it("should write OPEN state to KV when breaker trips locally", async () => {
    const breaker = new CircuitBreaker("test-provider", {
      failureThreshold: 2,
      recoveryTimeoutMs: 15_000,
    });

    // Trigger 2 failures to trip the breaker
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("provider down");
        });
      } catch {
        // expected
      }
    }

    expect(mockKV.put).toHaveBeenCalledWith(
      "cb:test-provider",
      expect.stringContaining('"state":"OPEN"'),
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );

    // Verify TTL is based on recoveryTimeoutMs
    const putCall = mockKV.put.mock.calls[0];
    const ttl = putCall![2].expirationTtl;
    expect(ttl).toBe(Math.ceil(15_000 / 1000) + 10); // 25s
  });

  it("should clear KV state on successful recovery", async () => {
    const breaker = new CircuitBreaker("test-provider", {
      failureThreshold: 2,
      recoveryTimeoutMs: 50,
    });

    // Trip the breaker
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }
    }

    // Wait for recovery
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Successful probe should clear KV
    mockKV.get.mockResolvedValue(null); // No fleet-wide block
    await breaker.execute(async () => "recovered");

    expect(mockKV.delete).toHaveBeenCalledWith("cb:test-provider");
  });

  it("should gracefully handle KV read failures (fall through to local state)", async () => {
    mockKV.get.mockRejectedValue(new Error("KV unavailable"));

    const breaker = new CircuitBreaker("test-provider", { failureThreshold: 3 });

    // Should not throw — KV failure is best-effort
    const result = await breaker.execute(async () => "ok");
    expect(result).toBe("ok");
  });

  it("should gracefully handle KV write failures (local breaker still works)", async () => {
    mockKV.put.mockRejectedValue(new Error("KV write failed"));

    const breaker = new CircuitBreaker("test-provider", { failureThreshold: 2 });

    // Trip the breaker — KV write will fail but local state should still trip
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }
    }

    // Local state should be OPEN regardless of KV failure
    expect(breaker.getState()).toBe("OPEN");
  });

  it("should work with getCircuitBreaker registry", async () => {
    const breaker = getCircuitBreaker("test-provider", { failureThreshold: 3 });

    const result = await breaker.execute(async () => "success");
    expect(result).toBe("success");
    expect(mockKV.get).toHaveBeenCalledWith("cb:test-provider", "json");
  });
});

describe("S9-C2: Circuit breaker without KV (non-Workers environment)", () => {
  beforeEach(() => {
    resetCircuitBreaker("local-provider");
  });

  it("should fall back to per-isolate behavior when KV is null", async () => {
    // Override the mock to return null (no KV available)
    const { getAppCacheKV } = await import("@/lib/runtime-env");
    vi.mocked(getAppCacheKV).mockReturnValue(null);

    const breaker = new CircuitBreaker("local-provider", { failureThreshold: 2 });

    // Trip locally
    for (let i = 0; i < 2; i++) {
      try {
        await breaker.execute(async () => {
          throw new Error("fail");
        });
      } catch {
        // expected
      }
    }

    // Should be open locally without KV interaction
    expect(breaker.getState()).toBe("OPEN");
    expect(mockKV.put).not.toHaveBeenCalled();
  });
});
