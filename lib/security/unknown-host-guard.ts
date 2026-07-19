/**
 * G-34 — Worker-wide unknown-host cap + negative-cache TTL ramp.
 *
 * Purpose
 * -------
 * The middleware's negative cache (`site-domain-miss:*`) keeps repeat
 * floods from random Host: headers off the database after the first miss.
 * Two gaps remained from the prior remediation:
 *
 *   1. The negative-cache TTL was a flat 5 minutes regardless of how
 *      persistent the abusive flood was.  A botnet rotating across a
 *      slow trickle of unique hostnames would expire each entry before
 *      it had paid for itself.  This module exposes
 *      `getNegativeCacheTtlSeconds(missCount)` which ramps the TTL
 *      exponentially up to a 1-hour ceiling.
 *
 *   2. The per-IP rate limit (30 hostname resolutions / IP / minute)
 *      did not protect the worker as a whole — a distributed flood from
 *      hundreds of IPs could still cumulatively force one KV read per
 *      previously-unseen hostname.  This module exposes
 *      `recordUnknownHostKvAccess(host)` which maintains a per-isolate
 *      sliding-window LRU and rejects access for a *new* unknown host
 *      once we've already touched KV for more than `MAX_UNIQUE_HOSTS`
 *      distinct hostnames in the last `WINDOW_MS` window.
 *
 * Both helpers are deliberately per-isolate (in-memory) — there is no
 * shared state across Cloudflare Workers isolates.  That is the right
 * level for this protection: each isolate handles only a subset of
 * traffic, the cap is per-isolate, and the cumulative effect across the
 * fleet is still proportional to the number of isolates.
 */

/** Hard ceiling on the negative-cache TTL — one hour. */
const NEGATIVE_CACHE_TTL_CEILING_SECONDS = 3600;
/** Floor / first-miss TTL — five minutes. Matches the original audit lock. */
const NEGATIVE_CACHE_TTL_FLOOR_SECONDS = 300;

/**
 * Negative-cache TTL ramp.  Hosts that don't match any registered
 * domain pattern start at 5 minutes; every subsequent miss doubles the
 * TTL up to a 1-hour ceiling.  The first call (missCount = 1) returns
 * the floor; a 5th-or-later miss returns the ceiling.
 *
 *   1 → 300s   (5 min)
 *   2 → 600s   (10 min)
 *   3 → 1200s  (20 min)
 *   4 → 2400s  (40 min)
 *   5+ → 3600s (1 hour, capped)
 */
export function getNegativeCacheTtlSeconds(missCount: number): number {
  // Defensive: callers may pass 0 or negatives if the KV value was
  // missing or corrupt.  Treat anything ≤ 1 as a first miss.
  const safeCount = Math.max(1, Math.floor(missCount));
  const ramped = NEGATIVE_CACHE_TTL_FLOOR_SECONDS * 2 ** (safeCount - 1);
  return Math.min(NEGATIVE_CACHE_TTL_CEILING_SECONDS, ramped);
}

/** Sliding window for the unknown-host LRU. */
const WINDOW_MS = 1000;
/** Per-isolate cap on distinct unknown hostnames touching KV per window. */
const MAX_UNIQUE_HOSTS = 100;

/**
 * Map<hostname, lastSeenMs>.  Insertion order is the LRU recency order,
 * which `Map` preserves natively.  We expire entries older than
 * `WINDOW_MS` lazily on each access so the structure never grows
 * unbounded even under a sustained flood.
 */
const recentUnknownHosts = new Map<string, number>();

/**
 * Pruning helper — drops entries whose `lastSeen` falls outside the
 * sliding window.  Returns the current size after pruning.
 */
function pruneExpired(now: number): number {
  // `Map` iteration is in insertion order, so once we hit a non-expired
  // entry we can stop — every later entry is at least as recent.
  for (const [host, lastSeen] of recentUnknownHosts) {
    if (now - lastSeen >= WINDOW_MS) {
      recentUnknownHosts.delete(host);
    } else {
      break;
    }
  }
  return recentUnknownHosts.size;
}

/**
 * Record that the middleware is about to perform a KV/DB lookup for an
 * unknown hostname.  Returns `{ allowed: false }` if the per-isolate
 * cap has been exceeded for the current sliding window — callers must
 * then short-circuit the request without touching KV or the DB.
 *
 * Already-seen hostnames within the window are always allowed (their
 * `lastSeen` is refreshed) — the cap is on *unique* hosts, not total
 * accesses, so a real onboarding event for a single new domain is
 * never blocked.
 */
export function recordUnknownHostKvAccess(host: string): { allowed: boolean } {
  const now = Date.now();
  pruneExpired(now);

  const existing = recentUnknownHosts.get(host);
  if (existing !== undefined) {
    // Refresh recency by re-inserting (delete + set keeps insertion
    // order = recency order).
    recentUnknownHosts.delete(host);
    recentUnknownHosts.set(host, now);
    return { allowed: true };
  }

  if (recentUnknownHosts.size >= MAX_UNIQUE_HOSTS) {
    return { allowed: false };
  }
  recentUnknownHosts.set(host, now);
  return { allowed: true };
}

/**
 * Test-only hook — clears the per-isolate LRU between unit tests so
 * test ordering does not leak state.  Production code never calls this.
 */
export function _resetUnknownHostGuardForTests(): void {
  recentUnknownHosts.clear();
}
