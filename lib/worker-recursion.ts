/**
 * F-017 / F-09: Self-referential subrequest recursion ceiling.
 *
 * The Worker can re-enter itself via the `WORKER_SELF_REFERENCE` service
 * binding (wrangler.jsonc) — primarily for OpenNext incremental-cache
 * operations. `middleware.ts` increments an `x-worker-recursion-depth`
 * header on each hop and rejects once the depth reaches the ceiling, so a
 * request cannot drive runaway self-amplification (CWE-674).
 *
 * The legitimate self-call chain is shallow (a single cache re-entry hop),
 * so the external audit (F-017) recommended tightening the historical
 * ceiling of 3 down to 2. We adopt 2 as the default but keep it
 * env-tunable via `MAX_WORKER_RECURSION_DEPTH` — the same "safe default +
 * instant ops escape hatch" idiom used elsewhere in the codebase
 * (RATE_LIMIT_KV_GRACE_MS, CRON_ALLOW_SHARED_FALLBACK_IN_PROD). If a future
 * OpenNext change ever needs a deeper legitimate chain, operators can raise
 * the ceiling without a redeploy instead of eating 508s.
 */

/** Tightened default ceiling (was 3 — see F-017). */
export const DEFAULT_MAX_RECURSION_DEPTH = 2;

/** Hard bounds so a misconfigured env value can't disable or explode the guard. */
const MIN_ALLOWED = 1;
const MAX_ALLOWED = 10;

/**
 * Resolve the recursion ceiling from an env value, falling back to the
 * tightened default for unset / non-numeric / out-of-range input. Pure and
 * side-effect free so it can be unit-tested without importing middleware.ts
 * (which is not cleanly importable under the edge runtime).
 */
export function resolveMaxRecursionDepth(
  raw: string | undefined = process.env.MAX_WORKER_RECURSION_DEPTH,
): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RECURSION_DEPTH;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_ALLOWED || parsed > MAX_ALLOWED) {
    return DEFAULT_MAX_RECURSION_DEPTH;
  }
  return parsed;
}

/** Resolved once at module load; env is stable for the lifetime of an isolate. */
export const MAX_RECURSION_DEPTH = resolveMaxRecursionDepth();

/** Header that carries the current self-reference depth between hops. */
export const RECURSION_DEPTH_HEADER = "x-worker-recursion-depth";
