/**
 * AUDIT-FIX: Cron job overlap prevention via KV-based distributed lock.
 *
 * Each cron job acquires a lock before executing. If a previous run is
 * still in progress (lock exists and hasn't expired), the new invocation
 * returns 409 Conflict without doing any work.
 *
 * The lock has a configurable TTL (default 10 minutes) that acts as a
 * safety net: if a cron run crashes without releasing the lock, the TTL
 * ensures the next scheduled invocation can proceed.
 *
 * Usage in a cron route:
 *
 *   const lock = cronLock("ai-generate", 600);
 *   if (!(await lock.acquire())) {
 *     return NextResponse.json({ error: "Already running" }, { status: 409 });
 *   }
 *   try {
 *     // ... do work ...
 *   } finally {
 *     await lock.release();
 *   }
 */

export interface CronLockHandle {
  /** Returns true if the lock was acquired, false if already held. */
  acquire(): Promise<boolean>;
  /** Release the lock. Safe to call even if acquire() returned false. */
  release(): Promise<void>;
}

/**
 * Create a cron lock handle for the given job name.
 *
 * @param jobName - Unique identifier for the cron job (e.g. "ai-generate")
 * @param ttlSeconds - Lock expiry in seconds (default: 600 = 10 minutes)
 */
export function cronLock(jobName: string, ttlSeconds = 600): CronLockHandle {
  const key = `cron-lock:${jobName}`;

  return {
    async acquire(): Promise<boolean> {
      try {
        const kv = (process.env as Record<string, unknown>).APP_CACHE_KV as
          | {
              get(k: string): Promise<string | null>;
              put(k: string, v: string, opts?: { expirationTtl: number }): Promise<void>;
            }
          | undefined;
        if (!kv) return true; // No KV = dev environment, skip locking
        const existing = await kv.get(key);
        if (existing) return false; // Already running
        await kv.put(key, Date.now().toString(), { expirationTtl: ttlSeconds });
        return true;
      } catch {
        return true; // KV error = fail open (allow the run)
      }
    },

    async release(): Promise<void> {
      try {
        const kv = (process.env as Record<string, unknown>).APP_CACHE_KV as
          | { delete(k: string): Promise<void> }
          | undefined;
        if (kv) await kv.delete(key);
      } catch {
        // Best-effort; TTL will clean up
      }
    },
  };
}
