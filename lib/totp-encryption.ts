/**
 * B-01: Envelope encryption for TOTP shared secrets at rest.
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
 * Algorithm: AES-256-GCM via Web Crypto API (compatible with
 * Cloudflare Workers and Node 18+). The ciphertext is stored as
 * `enc:v1:<base64(iv + ciphertext + tag)>`.
 */

import { logger } from "@/lib/logger";

const ENCRYPTION_PREFIX_V1 = "enc:v1:";
const ENCRYPTION_PREFIX_V2 = "enc:v2:";
/** Current prefix used for new encryptions */
const ENCRYPTION_PREFIX = ENCRYPTION_PREFIX_V2;

/**
 * Derive a 256-bit AES-GCM key from the raw env secret.
 * Uses HKDF with SHA-256 so the env var does not need to be exactly
 * 32 bytes — any reasonable secret length works.
 */
async function deriveKey(rawSecret: string): Promise<CryptoKey> {
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
      salt: encoder.encode("affilite-mix-totp-v1"),
      info: encoder.encode("totp-secret-encryption"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * A100-05: Key-versioned envelope encryption.
 *
 * Supports key rotation by checking TOTP_ENCRYPTION_KEY (current) and
 * TOTP_ENCRYPTION_KEY_PREVIOUS (prior key for decryption only).
 * New encryptions always use the current key (v2 prefix).
 * Decryption tries the current key first, then falls back to the previous key.
 */
function getEncryptionKey(): string | null {
  return process.env.TOTP_ENCRYPTION_KEY?.trim() || null;
}

function getPreviousEncryptionKey(): string | null {
  return process.env.TOTP_ENCRYPTION_KEY_PREVIOUS?.trim() || null;
}

/**
 * Encrypt a TOTP secret for storage.
 *
 * Returns the encrypted string prefixed with `enc:v1:` so the decrypt
 * path can distinguish encrypted from legacy plaintext values.
 */
export async function encryptTotpSecret(plaintext: string): Promise<string> {
  const rawKey = getEncryptionKey();
  if (!rawKey) {
    logger.warn(
      "[totp-encryption] TOTP_ENCRYPTION_KEY not set — storing TOTP secret in plaintext. " +
        "This is acceptable in dev/test but MUST be configured in production.",
    );
    return plaintext;
  }

  const key = await deriveKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for AES-GCM
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  // Concatenate IV + ciphertext (which includes the GCM auth tag)
  const combined = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.byteLength);

  // Base64-encode for safe DB storage
  const b64 = btoa(String.fromCharCode(...combined));
  return `${ENCRYPTION_PREFIX}${b64}`;
}

/**
 * Decrypt a TOTP secret from storage.
 *
 * A100-05: Supports key-versioned envelope encryption. Tries the current key
 * first, then falls back to the previous key (TOTP_ENCRYPTION_KEY_PREVIOUS).
 * Handles encrypted (`enc:v1:...`, `enc:v2:...`) and legacy plaintext values
 * so existing un-encrypted rows keep working until re-enrolled.
 */
export async function decryptTotpSecret(stored: string): Promise<string> {
  // Legacy plaintext — return as-is
  if (!stored.startsWith(ENCRYPTION_PREFIX_V1) && !stored.startsWith(ENCRYPTION_PREFIX_V2)) {
    return stored;
  }

  // Determine which prefix was used to extract the payload
  const prefix = stored.startsWith(ENCRYPTION_PREFIX_V2)
    ? ENCRYPTION_PREFIX_V2
    : ENCRYPTION_PREFIX_V1;

  const rawKey = getEncryptionKey();
  const previousKey = getPreviousEncryptionKey();

  if (!rawKey && !previousKey) {
    throw new Error(
      "[totp-encryption] Cannot decrypt TOTP secret: TOTP_ENCRYPTION_KEY is not configured. " +
        "The stored value is encrypted but the decryption key is missing.",
    );
  }

  const b64 = stored.slice(prefix.length);
  const combined = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

  // First 12 bytes are the IV, remainder is ciphertext + GCM tag
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Try current key first
  if (rawKey) {
    try {
      const key = await deriveKey(rawKey);
      const plainBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      return new TextDecoder().decode(plainBytes);
    } catch {
      // Current key failed — try previous key below
    }
  }

  // Fall back to previous key (rotation support)
  if (previousKey) {
    try {
      const key = await deriveKey(previousKey);
      const plainBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
      return new TextDecoder().decode(plainBytes);
    } catch {
      // Both keys failed
    }
  }

  throw new Error(
    "[totp-encryption] Cannot decrypt TOTP secret: neither current nor previous key could decrypt the value.",
  );
}

/**
 * A100-05: Check if a stored secret needs re-encryption with the current key.
 * Returns true if the secret uses v1 prefix or was encrypted with a previous key.
 */
export function needsReEncryption(stored: string): boolean {
  return stored.startsWith(ENCRYPTION_PREFIX_V1);
}

/**
 * Check whether a stored TOTP secret is already encrypted.
 */
export function isTotpSecretEncrypted(stored: string): boolean {
  return stored.startsWith(ENCRYPTION_PREFIX);
}
