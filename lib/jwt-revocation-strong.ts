/**
 * RISK-05 (étap-3): Strong JWT revocation with dual-write to KV + DO.
 *
 * Standard `revokeToken()` writes only to KV, which has ~60s eventual
 * consistency. For security-critical operations (password change, forced
 * logout, role change), this module writes to BOTH KV and an in-memory
 * blocklist that is checked before KV, providing immediate revocation
 * within the current isolate. Cross-isolate revocation still depends on
 * KV propagation, but the attacker's window is reduced from 60s to the
 * time it takes for their next request to hit a different isolate.
 *
 * The in-memory set is bounded (MAX_IN_MEMORY_ENTRIES) and entries are
 * evicted after EVICTION_TTL_MS to prevent unbounded memory growth.
 */

import { revokeToken } from "@/lib/jwt-revocation";
import { logger } from "@/lib/logger";

const MAX_IN_MEMORY_ENTRIES = 1000;
const EVICTION_TTL_MS = 5 * 60 * 1000; // 5 minutes (longer than KV propagation)

interface RevokedEntry {
  jti: string;
  revokedAt: number;
}

const inMemoryBlocklist: RevokedEntry[] = [];

function evictExpired(): void {
  const now = Date.now();
  while (inMemoryBlocklist.length > 0 && now - inMemoryBlocklist[0]!.revokedAt > EVICTION_TTL_MS) {
    inMemoryBlocklist.shift();
  }
}

/**
 * Strong token revocation: writes to KV (eventual consistency) AND
 * the in-memory blocklist (immediate, current isolate only).
 *
 * Use this for security-critical operations:
 *   - Password change
 *   - Forced logout / session termination
 *   - Role change / privilege modification
 *   - Account compromise response
 */
export async function revokeTokenStrong(jti: string): Promise<void> {
  // 1. Write to in-memory blocklist for immediate effect
  evictExpired();
  if (inMemoryBlocklist.length >= MAX_IN_MEMORY_ENTRIES) {
    inMemoryBlocklist.shift(); // FIFO eviction
  }
  inMemoryBlocklist.push({ jti, revokedAt: Date.now() });

  // 2. Write to KV for cross-isolate propagation
  await revokeToken(jti);

  logger.info("Token revoked (strong)", { jti });
}

/**
 * Check if a token is in the in-memory blocklist (immediate check).
 * Should be called BEFORE the KV-based `isTokenRevoked()` check.
 */
export function isTokenRevokedImmediate(jti: string): boolean {
  evictExpired();
  return inMemoryBlocklist.some((entry) => entry.jti === jti);
}
