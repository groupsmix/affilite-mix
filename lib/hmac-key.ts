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

const enc = new TextEncoder();

/** Import the master JWT secret as raw HKDF key material. */
async function getMasterKeyMaterial(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(getJwtSecret()), "HKDF", false, ["deriveKey"]);
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
