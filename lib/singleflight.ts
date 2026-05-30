/**
 * S9-H2 / AUDIT-H2: Singleflight request coalescing.
 *
 * Prevents thundering-herd scenarios where multiple concurrent requests
 * for the same resource each independently hit the upstream (Supabase,
 * API, etc.). Only the first caller executes the function; all concurrent
 * callers with the same key share the single in-flight Promise.
 *
 * Once the Promise resolves (or rejects), the key is removed from the
 * flight map so subsequent requests get fresh data.
 *
 * Usage:
 *   const flight = new Singleflight<SiteRow | null>();
 *   const site = await flight.do(`site:${slug}`, () => fetchSiteFromDB(slug));
 */

export class Singleflight<T> {
  // A75-F1: Cap the inflight map to prevent unbounded growth.
  private static readonly MAX_INFLIGHT = 10_000;
  private inflight = new Map<string, Promise<T>>();

  /**
   * Execute `fn` under the given `key`. If another call with the same key
   * is already in-flight, return its Promise instead of executing again.
   */
  async do(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) {
      return existing;
    }

    // Evict oldest entry (FIFO) when the map reaches its cap.
    if (this.inflight.size >= Singleflight.MAX_INFLIGHT) {
      const oldest = this.inflight.keys().next();
      if (!oldest.done) {
        this.inflight.delete(oldest.value);
      }
    }

    const promise = fn().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  /** Number of currently in-flight requests (useful for tests/metrics). */
  get size(): number {
    return this.inflight.size;
  }
}

/**
 * Global singleflight instance for Supabase site lookups.
 * Shared across the isolate's lifetime to coalesce concurrent site
 * resolution requests (the hottest read path in middleware).
 */
export const siteLookupFlight = new Singleflight<unknown>();

// ---------------------------------------------------------------------------
// Functional API (convenience wrapper around a global Singleflight instance)
// ---------------------------------------------------------------------------
const globalFlight = new Singleflight<unknown>();

/**
 * Execute `fn` only once for the given `key` at any point in time.
 * Concurrent callers with the same key receive the same promise.
 */
export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return globalFlight.do(key, fn) as Promise<T>;
}
