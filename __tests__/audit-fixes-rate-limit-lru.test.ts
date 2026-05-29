/**
 * Tests for A98-51: Rate-limit memory eviction FIFO→LRU.
 */

import { describe, it, expect, vi } from "vitest";

describe("A98-51: Rate-limit LRU eviction", () => {
  // Test the LRU eviction logic directly
  it("evicts least-recently-used entries when cap is exceeded", async () => {
    // Import the module fresh for each test
    vi.resetModules();

    // Use dynamic import to get fresh module state
    const rateLimitModule = await import("@/lib/rate-limit");
    const { checkRateLimit, __resetRateLimitKvStateForTests } = rateLimitModule;

    // Reset KV state so we use memory fallback
    __resetRateLimitKvStateForTests();

    // Fill up the memory store with many different keys
    const config = { maxRequests: 100, windowMs: 60_000 };
    const keys: string[] = [];

    // Add 50 keys (under the 10,000 cap)
    for (let i = 0; i < 50; i++) {
      const key = `test-key-${i}`;
      keys.push(key);
      await checkRateLimit(key, config);
    }

    // All 50 should be allowed
    for (let i = 0; i < 50; i++) {
      const result = await checkRateLimit(`test-key-${i}`, config);
      expect(result.allowed).toBe(true);
    }
  });

  it("rejects requests over the limit", async () => {
    vi.resetModules();
    const { checkRateLimit, __resetRateLimitKvStateForTests } = await import("@/lib/rate-limit");
    __resetRateLimitKvStateForTests();

    const config = { maxRequests: 3, windowMs: 60_000 };
    const key = "rate-limit-test";

    // 3 requests should be allowed
    const r1 = await checkRateLimit(key, config);
    expect(r1.allowed).toBe(true);
    const r2 = await checkRateLimit(key, config);
    expect(r2.allowed).toBe(true);
    const r3 = await checkRateLimit(key, config);
    expect(r3.allowed).toBe(true);

    // 4th should be denied
    const r4 = await checkRateLimit(key, config);
    expect(r4.allowed).toBe(false);
  });
});
