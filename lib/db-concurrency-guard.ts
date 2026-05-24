/**
 * A100-03: DB connection concurrency guard.
 *
 * Cloudflare Workers can scale to thousands of isolates, each making
 * independent requests to Supabase. This module provides a per-isolate
 * semaphore that limits concurrent Supabase requests to prevent
 * overwhelming the connection pooler under traffic spikes.
 *
 * This is a best-effort guard — it protects within a single isolate.
 * Cross-isolate coordination would require Durable Objects (future enhancement).
 */

const MAX_CONCURRENT_DB_REQUESTS = 50;
let _activeRequests = 0;
let _queuedRequests: Array<() => void> = [];

/**
 * Acquire a slot in the concurrency limiter.
 * Resolves immediately if under the limit, otherwise waits in a FIFO queue.
 * Rejects after `timeoutMs` to prevent indefinite blocking.
 */
export function acquireDbSlot(timeoutMs = 10_000): Promise<void> {
  if (_activeRequests < MAX_CONCURRENT_DB_REQUESTS) {
    _activeRequests++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = _queuedRequests.indexOf(release);
      if (idx !== -1) _queuedRequests.splice(idx, 1);
      reject(new Error("[db-concurrency-guard] Timed out waiting for DB slot"));
    }, timeoutMs);

    function release() {
      clearTimeout(timer);
      _activeRequests++;
      resolve();
    }

    _queuedRequests.push(release);
  });
}

/**
 * Release a slot back to the pool. Must be called after every DB operation
 * completes (success or failure).
 */
export function releaseDbSlot(): void {
  _activeRequests--;
  if (_queuedRequests.length > 0) {
    const next = _queuedRequests.shift()!;
    next();
  }
}

/**
 * Execute a function with automatic slot acquisition and release.
 */
export async function withDbSlot<T>(fn: () => Promise<T>, timeoutMs?: number): Promise<T> {
  await acquireDbSlot(timeoutMs);
  try {
    return await fn();
  } finally {
    releaseDbSlot();
  }
}

/** For testing/monitoring: current active request count. */
export function getActiveDbRequests(): number {
  return _activeRequests;
}
