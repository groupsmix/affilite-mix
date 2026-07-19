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
 * purpose-specific token) so no new secrets are required ΓÇö the token
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
import { getAppCacheKV } from "@/lib/runtime-env";
import { emitMetric } from "@/lib/metrics";

/** Maximum clock skew tolerance in milliseconds (60 seconds).
 * SEC-08: Tightened from 5 min to 60s. Internal calls are low-latency
 * (Worker ΓåÆ Worker on the same edge), so a 60s window is ample while
 * significantly reducing the replay attack window. */
const MAX_TIMESTAMP_SKEW_MS = 60 * 1000;

/** A28-005: Maximum acceptable future skew ΓÇö requests "from the future"
 * are rejected more aggressively than past skew (which could be benign
 * slow delivery). */
const MAX_FUTURE_SKEW_MS = 60_000; // 1 minute

/** Header names. */
const HMAC_HEADERS = {
  timestamp: "x-internal-timestamp",
  nonce: "x-internal-nonce",
  signature: "x-internal-signature",
} as const;

/**
 * In-memory nonce cache for replay detection.
 * A7-011: When APP_CACHE_KV is available (Cloudflare Workers), nonces are
 * also written to KV with a TTL matching the skew window. This provides
 * cross-isolate replay detection. The in-memory map is kept as a fast-path
 * to avoid a KV read on every request from the same isolate.
 */
const seenNonces = new Map<string, number>();
const NONCE_TTL_MS = MAX_TIMESTAMP_SKEW_MS + 60_000; // slightly longer than skew window
const NONCE_TTL_S = Math.ceil(NONCE_TTL_MS / 1000);

// Periodic cleanup of expired nonces
function monotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

let lastNonceCleanup = monotonicNow();
const NONCE_CLEANUP_INTERVAL_MS = 60_000;

function cleanupNonces(): void {
  const nowMonotonic = monotonicNow();
  if (nowMonotonic - lastNonceCleanup < NONCE_CLEANUP_INTERVAL_MS) return;
  lastNonceCleanup = nowMonotonic;
  for (const [nonce, expiresAt] of seenNonces) {
    if (expiresAt <= nowMonotonic) seenNonces.delete(nonce);
  }
}

/** Resolve the APP_CACHE_KV binding for cross-isolate nonce dedup. */
function getNonceKV(): {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
} | null {
  try {
    const kv = getAppCacheKV();
    if (kv && typeof kv.get === "function" && typeof kv.put === "function") return kv;
  } catch {
    // fail-open: best-effort [criticality:defence-in-depth]
    // Not available (local dev, CI)
    // Emit telemetry so KV availability is observable. [criticality:telemetry]
    emitMetric("fail_open_total", 1, { fail_open_location: "internal-hmac-kv-get" });
  }
  return null;
}

/** Check KV for a previously seen nonce (cross-isolate). Fail-open on error. */
async function isNonceSeenInKV(nonce: string): Promise<boolean> {
  const kv = getNonceKV();
  if (!kv) return false;
  try {
    const val = await kv.get(`hmac-nonce\x1F${nonce}`);
    return val !== null;
  } catch {
    // fail-open: best-effort [criticality:defence-in-depth]
    // Emit telemetry so KV availability is observable. [criticality:telemetry]
    emitMetric("fail_open_total", 1, { fail_open_location: "internal-hmac-kv-check" });
    return false;
  }
}

/** Record nonce in KV for cross-isolate visibility. Best-effort. */
async function recordNonceInKV(nonce: string): Promise<void> {
  const kv = getNonceKV();
  if (!kv) return;
  try {
    await kv.put(`hmac-nonce\x1F${nonce}`, "1", { expirationTtl: NONCE_TTL_S });
  } catch {
    // fail-open: best-effort [criticality:defence-in-depth]
    // Best-effort ΓÇö in-memory map is still the primary guard.
    // Emit telemetry so KV availability is observable. [criticality:telemetry]
    emitMetric("fail_open_total", 1, { fail_open_location: "internal-hmac-kv-put" });
  }
}

/**
 * Compute the HMAC-SHA256 signature for an internal request.
 *
 * The signature input is `${timestamp}\n${nonce}\n${context}\n${body}` when a
 * `context` is supplied, else the legacy `${timestamp}\n${nonce}\n${body}`.
 *
 * audit #7: `context` binds the operation (method + path + query) into the
 * signature so a captured request cannot be replayed against a different path
 * — e.g. appending `?dlq=true` to /api/queue/clicks. An empty context keeps the
 * exact legacy bytes so unbound callers (the click-dedup fingerprint and the
 * product-url cache MAC in app/api/track/click) produce identical output.
 */
export async function computeHmac(
  secret: string,
  timestamp: string,
  nonce: string,
  body: string,
  context = "",
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const message = encoder.encode(
    context ? `${timestamp}\n${nonce}\n${context}\n${body}` : `${timestamp}\n${nonce}\n${body}`,
  );
  const signature = await crypto.subtle.sign("HMAC", key, message);
  const hashArray = Array.from(new Uint8Array(signature));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * audit #7: Canonical request context bound into the internal HMAC signature.
 *
 * Signer and verifier MUST derive this identically from the SAME request
 * (method + path + query). The verifier passes `request.url`; each signer passes
 * the exact absolute URL it is about to fetch. Returns e.g.
 * `"POST\n/api/queue/clicks?dlq=true"`.
 */
export function buildInternalHmacContext(method: string, url: string): string {
  let pathAndQuery: string;
  try {
    const u = new URL(url);
    pathAndQuery = `${u.pathname}${u.search}`;
  } catch {
    // Already a path (or unparseable): use verbatim so both sides still agree
    // as long as they pass the same string.
    pathAndQuery = url;
  }
  return `${method.toUpperCase()}\n${pathAndQuery}`;
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
  context = "",
): Promise<Record<string, string>> {
  const timestamp = String(Date.now());
  const nonce = crypto.randomUUID();

  const signature = await computeHmac(secret, timestamp, nonce, body, context);

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
      ts,
      now,
      future_skew_ms: ts - now,
    });
    return { valid: false, reason: `Future timestamp ${ts - now}ms ahead of server clock` };
  }

  // 2. Nonce replay check (in-memory fast-path + KV cross-isolate)
  if (seenNonces.has(nonce)) {
    logger.warn("Internal HMAC nonce replay detected", { nonce });
    return { valid: false, reason: "Nonce already used (replay)" };
  }
  // A7-011: Cross-isolate nonce check via KV (fail-open if KV unavailable) [criticality:defence-in-depth]
  if (await isNonceSeenInKV(nonce)) {
    logger.warn("Internal HMAC nonce replay detected via KV", { nonce });
    return { valid: false, reason: "Nonce already used (replay)" };
  }

  // 3. HMAC signature verification.
  // audit #7: bind method + path + query so a captured signature can't be
  // replayed against a different operation (e.g. flipping ?dlq=true). During
  // rollout the worker (signer) and the app (verifier) deploy independently,
  // so unless INTERNAL_HMAC_BIND_MODE=strict we also accept the legacy
  // body-only signature, emitting telemetry so operators can confirm every
  // signer is bound before flipping to strict.
  const context = buildInternalHmacContext(request.method, request.url);
  const expectedBound = await computeHmac(secret, timestamp, nonce, body, context);
  let signatureValid = timingSafeEqual(signature, expectedBound);

  if (!signatureValid && process.env.INTERNAL_HMAC_BIND_MODE !== "strict") {
    const expectedLegacy = await computeHmac(secret, timestamp, nonce, body);
    if (timingSafeEqual(signature, expectedLegacy)) {
      signatureValid = true;
      logger.warn("internal_hmac_unbound_signature_accepted", {
        hint: "Signer has not adopted audit #7 context binding. Update all signers, then set INTERNAL_HMAC_BIND_MODE=strict.",
      });
      emitMetric("internal_hmac_unbound_accepted", 1, {});
    }
  }

  if (!signatureValid) {
    return { valid: false, reason: "Signature mismatch" };
  }

  // Mark nonce as seen (in-memory + KV)
  seenNonces.set(nonce, monotonicNow() + NONCE_TTL_MS);
  void recordNonceInKV(nonce);

  return { valid: true };
}

type SubtleCryptoWithTimingSafeEqual = SubtleCrypto & {
  timingSafeEqual?: (a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView) => boolean;
};

function encodeComparableBytes(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

function buildLengthPrefixedBuffer(bytes: Uint8Array, paddedLength: number): Uint8Array {
  const out = new Uint8Array(paddedLength + 4);
  new DataView(out.buffer).setUint32(0, bytes.byteLength);
  out.set(bytes, 4);
  return out;
}

function fallbackTimingSafeEqualBytes(aBytes: Uint8Array, bBytes: Uint8Array): boolean {
  const compareLength = Math.max(aBytes.byteLength, bBytes.byteLength);
  const left = buildLengthPrefixedBuffer(aBytes, compareLength);
  const right = buildLengthPrefixedBuffer(bBytes, compareLength);
  let diff = 0;
  for (let i = 0; i < left.byteLength; i++) {
    diff |= left[i]! ^ right[i]!;
  }
  return diff === 0;
}

/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * P0-4: Prefer the platform primitive when available. We compare
 * length-prefixed buffers so different-length inputs are still processed
 * by the timing-safe primitive without the old modulo-based custom loop.
 * Runtimes that do not yet expose `crypto.subtle.timingSafeEqual`
 * (notably the current Node test runner) fall back to a small
 * length-prefixed XOR compare purely to preserve compatibility.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encodeComparableBytes(a);
  const bBytes = encodeComparableBytes(b);
  const compareLength = Math.max(aBytes.byteLength, bBytes.byteLength);
  const left = buildLengthPrefixedBuffer(aBytes, compareLength);
  const right = buildLengthPrefixedBuffer(bBytes, compareLength);

  const subtle = crypto.subtle as SubtleCryptoWithTimingSafeEqual;
  if (typeof subtle.timingSafeEqual === "function") {
    return subtle.timingSafeEqual(left, right);
  }

  return fallbackTimingSafeEqualBytes(aBytes, bBytes);
}

/** @public Test helper: reset the nonce cache between test cases. */
export function __resetHmacNonceCacheForTests(): void {
  seenNonces.clear();
  lastNonceCleanup = monotonicNow();
}
