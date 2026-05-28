/**
 * S4-A98.2: Server-side pagination guards to prevent integer overflow
 * and unreasonable resource consumption on deep pagination.
 *
 * JS Number.MAX_SAFE_INTEGER is 2^53 - 1; Supabase .range(from, to)
 * computes `from + limit - 1` which overflows at very large offsets.
 * Capping offset and limit prevents this class of bugs.
 */

export const MAX_LIMIT = 200;
export const MAX_OFFSET = 100_000;
const DEFAULT_LIMIT = 20;

/**
 * Clamp and validate pagination parameters.
 * Returns safe values that can be passed directly to `.range()` or `.limit()`.
 */
export function clampPagination(opts: { limit?: number; offset?: number }): {
  limit: number;
  offset: number;
} {
  const rawLimit = opts.limit ?? DEFAULT_LIMIT;
  const rawOffset = opts.offset ?? 0;

  const limit = Math.max(1, Math.min(rawLimit, MAX_LIMIT));
  const offset = Math.max(0, Math.min(rawOffset, MAX_OFFSET));

  return { limit, offset };
}
