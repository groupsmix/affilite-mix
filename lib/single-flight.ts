/**
 * A75-F1: Single-flight / request coalescing for cache stampede prevention.
 *
 * When a cached site row expires (60s TTL), multiple concurrent requests
 * would all independently hit Supabase for the same domain. This module
 * ensures only the first request triggers the actual fetch — subsequent
 * concurrent requests wait for the in-progress result.
 *
 * This is the "single-flight" pattern (borrowed from Go's singleflight pkg).
 */

const inflight = new Map<string, Promise<unknown>>();

/**
 * Execute `fn` only once for the given `key` at any point in time.
 * Concurrent callers with the same key receive the same promise.
 * Once the promise settles (resolve or reject), the key is cleared
 * so the next caller triggers a fresh execution.
 */
export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const promise = fn().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, promise);
  return promise;
}

/** Test-only: clear all inflight entries. */
function __resetSingleFlightForTests(): void {
  inflight.clear();
}
