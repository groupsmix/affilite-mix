/**
 * A30-002: Read-after-write consistency helpers.
 *
 * In a replicated/primary-DB setup, writes go to the primary and reads
 * from replicas may be stale. This module provides strategies for
 * ensuring consistent reads after mutations.
 *
 * Strategies:
 *   1. Primary reads: route read-after-write queries to the primary
 *   2. Versioned cache: embed a version/token and retry on mismatch
 *   3. Bounded staleness: accept reads up to N seconds stale
 *
 * Current implementation: Supabase single-primary (no replicas).
 * These helpers are forward-looking — they document the intent and
 * provide the hook points when replication is introduced.
 */

import { logger } from "./logger";

/** A30-002: Read consistency level for a query. */
type ReadConsistency = "strict" | "eventual" | "bounded";

interface ReadAfterWriteOptions {
  /** Consistency level required */
  consistency?: ReadConsistency;
  /** For bounded consistency: max acceptable staleness in ms */
  maxStalenessMs?: number;
  /** Write timestamp for version-check strategy */
  writeTimestamp?: number;
}

/**
 * A30-002: Determine whether to use primary or replica for a read
 * following a write. In the current single-primary setup this always
 * returns "primary" for strict consistency, but the hook point exists
 * for future replica routing.
 */
function routeForReadAfterWrite(opts: ReadAfterWriteOptions = {}): "primary" | "replica" {
  const { consistency = "strict" } = opts;
  if (consistency === "strict") {
    return "primary";
  }
  if (consistency === "bounded") {
    return "primary"; // conservative — can relax once bounded staleness is implemented
  }
  return "replica";
}

/**
 * A30-002: Read-after-write guard for critical mutations.
 *
 * Wrap a read query that follows a write to ensure it sees the mutation.
 * Currently returns the result of `readFn` directly; future implementation
 * will retry with primary routing if the initial read is stale.
 */
async function readAfterWrite<T>(
  readFn: () => Promise<T>,
  opts: ReadAfterWriteOptions = {},
): Promise<T> {
  const route = routeForReadAfterWrite(opts);

  if (route === "primary") {
    // Future: set a request-scoped hint to use primary connection
  }

  try {
    const result = await readFn();
    return result;
  } catch (error) {
    // A30-002: Log read-after-write failures for monitoring
    logger.warn("Read-after-write query failed", {
      consistency: opts.consistency,
      route,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * A30-006: Primary read for authorization decisions.
 *
 * Authz reads MUST use the primary to prevent stale replica data from
 * granting/revoking permissions based on outdated state.
 */
export function authzPrimaryRead<T>(readFn: () => Promise<T>): Promise<T> {
  // Always route to primary for authorization queries
  return readAfterWrite(readFn, { consistency: "strict" });
}
