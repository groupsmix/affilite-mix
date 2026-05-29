/**
 * B-01 / A100-05: Envelope encryption for TOTP shared secrets at rest.
 *
 * TOTP secrets stored in the database must be encrypted so a DB dump,
 * backup exfiltration, or service-role key leak does not compromise
 * 2FA for every enrolled admin.
 *
 * The encryption key is read from the TOTP_ENCRYPTION_KEY environment
 * variable. When the key is absent (dev/test without the secret), the
 * module falls back to plaintext with a loud warning so local
 * development is not blocked.
 *
 * A100-05: Key rotation support via versioned envelope. The ciphertext
 * prefix encodes the key version (e.g. `enc:v1:`, `enc:v2:`). When
 * TOTP_ENCRYPTION_KEY_V2 is set, new encryptions use v2. Decryption
 * supports both v1 and v2 so existing secrets remain readable during
 * rotation. On next successful login, the secret is transparently
 * re-encrypted with the latest key version.
 *
 * Algorithm: AES-256-GCM via Web Crypto API (compatible with
 * Cloudflare Workers and Node 18+).
 */

import { logger } from "@/lib/logger";

const ENCRYPTION_PREFIX_V1 = "enc:v1:";
const ENCRYPTION_PREFIX_V2 = "enc:v2:";

/**
 * Derive a 256-bit AES-GCM key from the raw env secret.
 * Uses HKDF with SHA-256 so the env var does not need to be exactly
 * 32 bytes — any reasonable secret length works.
 */
async function deriveKey(rawSecret: string, version: number): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(rawSecret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      // Use version-specific salt to ensure distinct derived keys even if
      // the raw secret is accidentally reused across versions.
      salt: encoder.encode(`affilite-mix-totp-v${version}`),
      info: encoder.encode("totp-secret-encryption"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function getEncryptionKeyV1(): string | null {
  return process.env.TOTP_ENCRYPTION_KEY?.trim() || null;
}

function getEncryptionKeyV2(): string | null {
  return process.env.TOTP_ENCRYPTION_KEY_V2?.trim() || null;
}

/**
 * Determine the latest key version available for encryption.
 * V2 takes precedence when set; otherwise falls back to V1.
 */
function getLatestKeyInfo(): { version: number; rawKey: string; prefix: string } | null {
  const v2 = getEncryptionKeyV2();
  if (v2) return { version: 2, rawKey: v2, prefix: ENCRYPTION_PREFIX_V2 };
  const v1 = getEncryptionKeyV1();
  if (v1) return { version: 1, rawKey: v1, prefix: ENCRYPTION_PREFIX_V1 };
  return null;
}

/**
 * Encrypt a TOTP secret for storage.
 *
 * Returns the encrypted string prefixed with `enc:v{N}:` so the decrypt
 * path can distinguish encrypted from legacy plaintext values and select
 * the correct decryption key.
 */
export async function encryptTotpSecret(plaintext: string): Promise<string> {
  const keyInfo = getLatestKeyInfo();
  if (!keyInfo) {
    // A6-002 / A7-07: Fail closed in production — never store TOTP secrets plaintext
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[totp-encryption] TOTP_ENCRYPTION_KEY not set in production — " +
          "refusing to store TOTP secret in plaintext. Set TOTP_ENCRYPTION_KEY to enable MFA.",
      );
    }
    logger.warn(
      "[totp-encryption] TOTP_ENCRYPTION_KEY not set — storing TOTP secret in plaintext. " +
        "This is acceptable in dev/test but MUST be configured in production.",
    );
    return plaintext;
  }

  const key = await deriveKey(keyInfo.rawKey, keyInfo.version);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  // Concatenate IV + ciphertext (which includes the GCM auth tag)
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  // Base64-encode for safe DB storage
  const b64 = btoa(String.fromCharCode(...combined));
  return `${keyInfo.prefix}${b64}`;
}

/**
 * Decrypt a TOTP secret from storage.
 *
 * Handles encrypted (`enc:v1:...`, `enc:v2:...`) and legacy plaintext values
 * so existing un-encrypted rows keep working until re-enrolled.
 */
export async function decryptTotpSecret(stored: string): Promise<string> {
  // Legacy plaintext — return as-is
  if (!stored.startsWith("enc:")) {
    return stored;
  }

  let rawKey: string | null;
  let version: number;
  let b64: string;

  if (stored.startsWith(ENCRYPTION_PREFIX_V2)) {
    rawKey = getEncryptionKeyV2();
    version = 2;
    b64 = stored.slice(ENCRYPTION_PREFIX_V2.length);
  } else if (stored.startsWith(ENCRYPTION_PREFIX_V1)) {
    rawKey = getEncryptionKeyV1();
    version = 1;
    b64 = stored.slice(ENCRYPTION_PREFIX_V1.length);
  } else {
    throw new Error("[totp-encryption] Unknown encryption version prefix in stored TOTP secret.");
  }

  if (!rawKey) {
    throw new Error(
      `[totp-encryption] Cannot decrypt TOTP secret: TOTP_ENCRYPTION_KEY${version > 1 ? `_V${version}` : ""} is not configured. ` +
        "The stored value is encrypted but the decryption key is missing.",
    );
  }

  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  // First 12 bytes are the IV, remainder is ciphertext + GCM tag
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const key = await deriveKey(rawKey, version);
  const plainBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);

  return new TextDecoder().decode(plainBytes);
}

/**
 * Check whether a stored TOTP secret is already encrypted.
 */
export function isTotpSecretEncrypted(stored: string): boolean {
  return stored.startsWith("enc:");
}

/**
 * A100-05 / H-3 (#594): Check whether a stored secret needs re-encryption
 * with the latest key. Returns true if the secret is either plaintext or
 * encrypted with an older key version.
 */
export function needsReEncryption(stored: string): boolean {
  const keyInfo = getLatestKeyInfo();
  if (!keyInfo) return false; // No key configured, can't re-encrypt

  // Plaintext needs encryption
  if (!stored.startsWith("enc:")) return true;

  // Already on latest version
  if (stored.startsWith(keyInfo.prefix)) return false;

  // Encrypted with older version — needs rotation
  return true;
}

/**
 * H-3 (#594): Decrypt a stored TOTP secret and re-encrypt it with the
 * latest key version if needed. Returns `{ plaintext, newEncrypted, rotated }`.
 *
 * - `rotated` is true when the stored value was plaintext or encrypted with
 *   an older key, and a fresh ciphertext was produced with the current key.
 * - Callers should persist `newEncrypted` back to the DB when `rotated` is true.
 */
export async function decryptAndRotate(
  stored: string,
): Promise<{ plaintext: string; newEncrypted: string | null; rotated: boolean }> {
  const plaintext = await decryptTotpSecret(stored);

  if (!needsReEncryption(stored)) {
    return { plaintext, newEncrypted: null, rotated: false };
  }

  const newEncrypted = await encryptTotpSecret(plaintext);
  return { plaintext, newEncrypted, rotated: true };
}
