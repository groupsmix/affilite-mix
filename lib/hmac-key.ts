/**
 * A6-03 (NIST SP 800-108): Per-purpose HMAC key derivation.
 *
 * All HMAC usages in this codebase previously imported the raw JWT secret and
 * used it directly as an HMAC-SHA256 key.  Using the same key material across
 * multiple purposes (JWT signing, activity cookie MAC, signed-cookie MAC)
 * violates NIST SP 800-108 key separation.
 *
 * This module derives independent sub-keys from the master JWT secret using
 * HKDF-SHA256 (RFC 5869) so each purpose gets cryptographically independent
 * key material while a single secret in the environment is all that's needed.
 *
 * Derivation labels / info strings are hard-coded here to prevent callers from
 * accidentally sharing keys by passing the same label.
 */

import { getJwtSecret } from "@/lib/jwt-secret";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

const enc = new TextEncoder();

/** Import the master JWT secret as raw HKDF key material. */
async function getMasterKeyMaterial(): Promise<CryptoKey> {
  // audit #4: also allow `deriveBits` so we can expose a STRING form of a
  // derived subkey (see getOrDeriveHmacKeyString) for callers whose HMAC
  // primitive takes a raw string secret (e.g. computeHmac).
  return crypto.subtle.importKey("raw", enc.encode(getJwtSecret()), "HKDF", false, [
    "deriveKey",
    "deriveBits",
  ]);
}

/**
 * Derive a purpose-specific HMAC-SHA256 CryptoKey.
 *
 * @param purpose  A short ASCII label that uniquely identifies the usage
 *                 (e.g. "activity-cookie", "signed-cookie").
 * @param usages   Key usages to request — typically ["sign"] or ["verify"]
 *                 or ["sign", "verify"].
 */
export async function deriveHmacKey(purpose: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const master = await getMasterKeyMaterial();
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      // salt: empty (per RFC 5869 §3.1 when no independent salt is available)
      salt: new Uint8Array(0),
      // info: purpose label — makes derived keys domain-separated
      info: enc.encode(`affilite-mix:hmac:${purpose}`),
    },
    master,
    { name: "HMAC", hash: "SHA-256", length: 256 },
    false,
    usages,
  );
}

// Q10-2: Pre-warm frequently used HMAC keys at module load to reduce
// cold-start latency. importKey + deriveKey are ~30ms on first call;
// caching the promise avoids repeating that cost on the first request.
const keyCache = new Map<string, Promise<CryptoKey>>();

export function getOrDeriveHmacKey(purpose: string, usages: KeyUsage[]): Promise<CryptoKey> {
  const cacheKey = `${purpose}:${usages.join(",")}`;
  let p = keyCache.get(cacheKey);
  if (!p) {
    p = deriveHmacKey(purpose, usages);
    keyCache.set(cacheKey, p);
  }
  return p;
}

/**
 * audit #4: String form of the per-purpose HMAC subkey.
 *
 * Some callers (e.g. `computeHmac` in lib/internal-hmac.ts) take the secret as a
 * string and import it as raw HMAC key bytes — they can't consume a non-extractable
 * CryptoKey. For those we expose the derived key material as lowercase hex via HKDF
 * `deriveBits`, using the SAME salt/info as `deriveHmacKey`, so a given `purpose`
 * yields consistent material in either form and stays stable across isolates and
 * deploys (the derivation root is the fixed JWT secret).
 *
 * This is what lets click dedup + cache signing keep working when
 * CLICK_CACHE_HMAC_KEY is unset, instead of silently turning off.
 */
async function deriveHmacKeyString(purpose: string): Promise<string> {
  const master = await getMasterKeyMaterial();
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: enc.encode(`affilite-mix:hmac:${purpose}`),
    },
    master,
    256,
  );
  return Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const stringKeyCache = new Map<string, Promise<string>>();

export function getOrDeriveHmacKeyString(purpose: string): Promise<string> {
  let p = stringKeyCache.get(purpose);
  if (!p) {
    p = deriveHmacKeyString(purpose);
    stringKeyCache.set(purpose, p);
  }
  return p;
}

// Eagerly derive the most-used keys so the first request doesn't pay the cost.
// Only attempt when JWT_SECRET is available to avoid unhandled rejections in
// test suites that simulate production-without-secrets scenarios.
if (process.env.JWT_SECRET || process.env.JWT_SECRET_CURRENT) {
  void getOrDeriveHmacKey("activity-cookie", ["sign", "verify"]).catch((e) => {
    logger.error("[hmac-key] Pre-warm failed for activity-cookie", { error: String(e) });
    captureException(e, { context: "[hmac-key] Pre-warm failed for activity-cookie" });
  });
  void getOrDeriveHmacKey("signed-cookie", ["sign", "verify"]).catch((e) => {
    logger.error("[hmac-key] Pre-warm failed for signed-cookie", { error: String(e) });
    captureException(e, { context: "[hmac-key] Pre-warm failed for signed-cookie" });
  });
}
