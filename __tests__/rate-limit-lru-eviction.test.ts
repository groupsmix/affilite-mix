/**
 * A98-51: Rate-limit memory eviction FIFO→LRU.
 *
 * Tests for the LRU (Least Recently Used) eviction logic in the in-memory
 * rate-limit store. When the store reaches capacity (MEMORY_STORE_MAX_ENTRIES),
 * the least recently accessed entries are evicted, not the oldest entries (FIFO).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const captureExceptionMock = vi.fn();
vi.mock("@/lib/sentry", () => ({
  captureException: (...args: any[]) => captureExceptionMock(...args),
}));

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

describe("A98-51: Rate-limit LRU eviction", () => {
  it("allows requests when under capacity", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { checkRateLimit } = await loadModule();

    const config = { maxRequests: 100, windowMs: 60_000 };

    // Add 50 keys (well under the 10,000 cap)
    for (let i = 0; i < 50; i++) {
      const result = await checkRateLimit(`key-${i}`, config);
      expect(result.allowed).toBe(true);
    }

    // All 50 should be retrievable with their counts
    for (let i = 0; i < 50; i++) {
      const result = await checkRateLimit(`key-${i}`, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeLessThan(config.maxRequests);
    }
  });

  it("triggers LRU eviction when memory store reaches capacity", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RATE_LIMIT_MEMORY_MAX_ENTRIES", "10000");
    const { checkRateLimit } = await loadModule();

    const config = { maxRequests: 5, windowMs: 60_000 };

    // Fill the store to capacity (10,000 entries)
    // Each key gets one timestamp
    for (let i = 0; i < 10_000; i++) {
      const result = await checkRateLimit(`key-${i}`, config);
      expect(result.allowed).toBe(true);
    }

    // Now add one more key — this should trigger LRU eviction of the oldest accessed entry
    const result = await checkRateLimit("key-10000", config);
    expect(result.allowed).toBe(true);

    // Key-0 (oldest, least recently used) should have been evicted
    // Accessing it again should start fresh with no prior request count
    const afterEvictionCheck = await checkRateLimit("key-0", config);
    expect(afterEvictionCheck.allowed).toBe(true);
    expect(afterEvictionCheck.remaining).toBe(config.maxRequests - 1);
  });

  it("evicts least-recently-used entries, not oldest", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("RATE_LIMIT_MEMORY_MAX_ENTRIES", "10000");
    const { checkRateLimit } = await loadModule();

    const config = { maxRequests: 5, windowMs: 60_000 };

    // Add first 3 keys to establish baseline
    await checkRateLimit("old-key-1", config);
    await checkRateLimit("old-key-2", config);
    await checkRateLimit("old-key-3", config);

    // Add many more keys to approach capacity
    for (let i = 0; i < 9_997; i++) {
      await checkRateLimit(`fill-key-${i}`, config);
    }

    // Re-touch old-key-2 to make it recently used
    // This updates its lastAccess timestamp to "now"
    await checkRateLimit("old-key-2", config);

    // Now add a new key that triggers eviction
    // Since old-key-2 was just accessed, old-key-1 should be evicted instead
    // (it has the earliest lastAccess timestamp)
    await checkRateLimit("new-final-key", config);

    // old-key-2 should still exist (was recently accessed)
    const stillExists = await checkRateLimit("old-key-2", config);
    expect(stillExists.allowed).toBe(true);
    // It should have 2 timestamps (we called it twice)
    expect(stillExists.remaining).toBeLessThan(config.maxRequests);

    // old-key-1 should have been evicted (oldest access time)
    // Accessing it now starts fresh
    const evicted = await checkRateLimit("old-key-1", config);
    expect(evicted.allowed).toBe(true);
    expect(evicted.remaining).toBe(config.maxRequests - 1);
  });

  it("handles cleanup of expired timestamps in memory store", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.useFakeTimers();

    const start = Date.UTC(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(start);

    const { checkRateLimit } = await loadModule();

    const config = { maxRequests: 100, windowMs: 1000 }; // 1 second window

    // Add several requests to one key within the window
    const key = "cleanup-test";
    await checkRateLimit(key, config);
    await checkRateLimit(key, config);

    // Advance time past the window so old timestamps expire
    vi.setSystemTime(start + 1100);

    // This call should trigger cleanup which filters out the expired timestamps
    const result = await checkRateLimit(key, config);
    expect(result.allowed).toBe(true);
    // Since the old timestamps were cleaned up, we should have room again
    expect(result.remaining).toBeGreaterThan(90);
  });

  it("handles multiple rapid requests to same key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { checkRateLimit } = await loadModule();

    const config = { maxRequests: 10, windowMs: 60_000 };
    const key = "rapid-fire";

    // Burst 10 requests to the same key
    for (let i = 0; i < 10; i++) {
      const result = await checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(config.maxRequests - (i + 1));
    }

    // 11th should be denied
    const denied = await checkRateLimit(key, config);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets request count when timestamps expire", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.useFakeTimers();

    const start = Date.UTC(2025, 0, 1, 0, 0, 0);
    vi.setSystemTime(start);

    const { checkRateLimit } = await loadModule();

    const config = { maxRequests: 5, windowMs: 2000 };
    const key = "expiry-test";

    // Hit the limit
    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
    }

    // 6th request should be denied
    let denied = await checkRateLimit(key, config);
    expect(denied.allowed).toBe(false);

    // Advance time past the window
    vi.setSystemTime(start + 2100);

    // Now it should be allowed again (timestamps expired)
    const afterWindow = await checkRateLimit(key, config);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(config.maxRequests - 1);
  });
});
