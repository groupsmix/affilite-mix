/**
 * FIX-03 (F-003): HMAC-based request authentication with nonce and timestamp.
 *
 * Prevents replay attacks on internal endpoints (queue consumers, cron routes)
 * by requiring:
 *   1. An HMAC-SHA256 signature over (timestamp + nonce + body)
 *   2. A monotonically increasing nonce (UUID v4 recommended)
 *   3. A timestamp within the last 5 minutes
 *
 * The HMAC key is derived from the existing INTERNAL_API_TOKEN (or
 * purpose-specific token) so no new secrets are required — the token
 * that was previously sent as a Bearer credential is now used as the
 * signing key instead.
 *
 * Wire-up:
 *   - Sender (custom-worker.ts): call `signInternalRequest()` before fetch()
 *   - Receiver (API routes): call `verifyInternalHmac()` before processing
 *
 * Backward compat:
 *   - During migration, routes that verify HMAC should also accept the
 *     legacy Bearer token for a transition period (controlled by
 *     INTERNAL_HMAC_MIGRATION_MODE env var).
 */

import { logger } from "@/lib/logger";

/** Maximum clock skew tolerance in milliseconds (5 minutes).
 * A28-005: HMAC timestamp validation allows 5-min skew. For JWT refresh,
 * the auth module has its own handling — keep this conservative for
 * internal endpoint security. */
const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000;

/** A28-005: Maximum acceptable future skew — requests "from the future"
 * are rejected more aggressively than past skew (which could be benign
 * slow delivery). */
const MAX_FUTURE_SKEW_MS = 60_000; // 1 minute

/** Header names. */
export const HMAC_HEADERS = {
  timestamp: "x-internal-timestamp",
  nonce: "x-internal-nonce",
  signature: "x-internal-signature",
} as const;

/**
 * In-memory nonce cache for replay detection.
 * FRESH-08 (caveat): This is a per-isolate map. In a distributed
 * Cloudflare Workers deployment with multiple active isolates, a replayed
 * request could bypass this check if it lands on a different isolate
 * before the timestamp skew window expires. True global replay protection
 * requires a Durable Object or KV backing store.
 */
const seenNonces = new Map<string, number>();
const NONCE_TTL_MS = MAX_TIMESTAMP_SKEW_MS + 60_000; // slightly longer than skew window

// Periodic cleanup of expired nonces
let lastNonceCleanup = Date.now();
const NONCE_CLEANUP_INTERVAL_MS = 60_000;

function cleanupNonces(): void {
  const now = Date.now();
  if (now - lastNonceCleanup < NONCE_CLEANUP_INTERVAL_MS) return;
  lastNonceCleanup = now;
  for (const [nonce, expiresAt] of seenNonces) {
    if (expiresAt <= now) seenNonces.delete(nonce);
  }
}

/**
 * Compute the HMAC-SHA256 signature for an internal request.
 *
 * The signature input is: `${timestamp}\n${nonce}\n${body}`
 * using the shared secret as the HMAC key.
 */
export async function computeHmac(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = encoder.encode(`${timestamp}\n${nonce}\n${body}`);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Sign an internal request by adding HMAC headers.
 *
 * Call this in the sender (custom-worker.ts) before making fetch() calls
 * to internal endpoints.
 */
export async function signInternalRequest(
  secret: string,
  body: string,
  headers: Record<string, string> = {},
): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();

  const signature = await computeHmac(secret, timestamp, nonce, body);

  return {
    ...headers,
    [HMAC_HEADERS.timestamp]: timestamp,
    [HMAC_HEADERS.nonce]: nonce,
    [HMAC_HEADERS.signature]: signature,
  };
}

export interface HmacVerificationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Verify the HMAC signature on an incoming internal request.
 *
 * Call this in the receiver (API routes) before processing the request.
 * Returns `{ valid: true }` on success, or `{ valid: false, reason }` on failure.
 */
export async function verifyInternalHmac(
  secret: string,
  request: Request,
  body: string,
): Promise<HmacVerificationResult> {
  cleanupNonces();

  const timestamp = request.headers.get(HMAC_HEADERS.timestamp);
  const nonce = request.headers.get(HMAC_HEADERS.nonce);
  const signature = request.headers.get(HMAC_HEADERS.signature);

  if (!timestamp || !nonce || !signature) {
    return { valid: false, reason: "Missing HMAC headers" };
  }

  // 1. Timestamp freshness check
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return { valid: false, reason: "Invalid timestamp" };
  }
  const now = Date.now();
  const skew = Math.abs(now - ts);
  if (skew > MAX_TIMESTAMP_SKEW_MS) {
    return { valid: false, reason: `Timestamp skew ${skew}ms exceeds ${MAX_TIMESTAMP_SKEW_MS}ms` };
  }

  // A28-005: Reject requests "from the future" more aggressively.
  // A request with ts > now + MAX_FUTURE_SKEW_MS suggests a compromised
  // sender clock or replay with a forged future timestamp.
  if (ts > now + MAX_FUTURE_SKEW_MS) {
    logger.warn("Internal HMAC future timestamp rejected", { 
      ts, now, future_skew_ms: ts - now 
    });
    return { valid: false, reason: `Future timestamp ${ts - now}ms ahead of server clock` };
  }

  // 2. Nonce replay check
  if (seenNonces.has(nonce)) {
    logger.warn("Internal HMAC nonce replay detected", { nonce });
    return { valid: false, reason: "Nonce already used (replay)" };
  }

  // 3. HMAC signature verification
  const expected = await computeHmac(secret, timestamp, nonce, body);
  if (!timingSafeEqual(signature, expected)) {
    return { valid: false, reason: "Signature mismatch" };
  }

  // Mark nonce as seen
  seenNonces.set(nonce, now + NONCE_TTL_MS);

  return { valid: true };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Pads the shorter input to match the longer one so that length
 * mismatches do not leak via an early return.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const maxLen = Math.max(a.length, b.length);
  const aPadded = a.padEnd(maxLen, "\0");
  const bPadded = b.padEnd(maxLen, "\0");
  const aBuf = new TextEncoder().encode(aPadded);
  const bBuf = new TextEncoder().encode(bPadded);
  let result = a.length ^ b.length;
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i];
  }
  return result === 0;
}

/** Test helper: reset the nonce cache between test cases. */
export function __resetHmacNonceCacheForTests(): void {
  seenNonces.clear();
  lastNonceCleanup = Date.now();
}
