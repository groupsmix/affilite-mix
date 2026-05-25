import * as OTPAuth from "otpauth";

const ISSUER = "AffiliateMix Admin";
const ALGORITHM = "SHA1";
const DIGITS = 6;
const PERIOD = 30;

// A98-53: Markers for encrypted TOTP secrets to distinguish from legacy plaintext
const ENCRYPTION_PREFIX = "enc:v1:";
const ENCRYPTION_PREFIX_PREVIOUS = "enc:v0:";

/**
 * A98-53: Check whether a stored TOTP secret is encrypted.
 * Legacy plaintext secrets (base32 strings without a prefix) are detected
 * as unencrypted so the rotation flow can re-encrypt them.
 */
export function isTotpSecretEncrypted(secret: string | null | undefined): boolean {
  if (!secret) return false;
  return secret.startsWith(ENCRYPTION_PREFIX) || secret.startsWith(ENCRYPTION_PREFIX_PREVIOUS);
}

/**
 * A98-53: Check whether a stored TOTP secret needs re-encryption.
 * Returns true for:
 *   - Unencrypted (legacy plaintext) secrets
 *   - Secrets encrypted with the previous key (enc:v0:)
 * Returns false for secrets already encrypted with the current key (enc:v1:).
 */
export function needsReEncryption(secret: string | null | undefined): boolean {
  if (!secret) return false;
  // Already encrypted with current key — no rotation needed
  if (secret.startsWith(ENCRYPTION_PREFIX)) return false;
  // Legacy plaintext or previous-key encryption — needs rotation
  return true;
}

/**
 * A98-53: Strip the encryption prefix to get the raw encrypted payload.
 * Returns null for unencrypted or malformed secrets.
 */
export function extractEncryptedPayload(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (secret.startsWith(ENCRYPTION_PREFIX)) return secret.slice(ENCRYPTION_PREFIX.length);
  if (secret.startsWith(ENCRYPTION_PREFIX_PREVIOUS)) return secret.slice(ENCRYPTION_PREFIX_PREVIOUS.length);
  return null;
}

/**
 * A98-53: Wrap an encrypted ciphertext with the current encryption prefix.
 */
export function wrapEncryptedSecret(ciphertext: string): string {
  return ENCRYPTION_PREFIX + ciphertext;
}

/**
 * Generate a new TOTP secret for enrollment.
 * Returns the secret (base32) and the otpauth:// URI for QR code generation.
 *
 * SECURITY: The returned secret is raw (unencrypted). Callers MUST encrypt
 * it with encryptTotpSecret() before storing in the database.
 */
export function generateTotpSecret(email: string): {
  secret: string;
  uri: string;
} {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Verify a TOTP token against a raw secret (unencrypted base32).
 * Allows a window of ±1 period (30s) to account for clock drift.
 *
 * SECURITY: Prefer verifyTotpTokenWithRotation() for DB-stored secrets,
 * as it handles encrypted values and key rotation correctly.
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: ALGORITHM,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // delta returns null if invalid, or the time step difference if valid
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * A98-53: Verify a TOTP token against a potentially encrypted stored secret.
 *
 * This is the RECOMMENDED verification path for DB-stored secrets because it:
 *   1. Detects encrypted vs plaintext secrets
 *   2. Attempts verification with both current and previous encryption keys
 *   3. Prevents lockouts during TOTP encryption key rotation
 *
 * @param storedSecret - The secret as stored in DB (may be encrypted or plaintext)
 * @param token - The 6-digit TOTP code from the user
 * @param decryptFn - Callback that decrypts the ciphertext; receives (ciphertext, isPreviousKey)
 * @returns boolean indicating whether the token is valid
 */
export async function verifyTotpTokenWithRotation(
  storedSecret: string | null | undefined,
  token: string,
  decryptFn: (ciphertext: string, usePreviousKey: boolean) => Promise<string | null>,
): Promise<boolean> {
  if (!storedSecret || !token) return false;

  // Normalize token (remove whitespace)
  const normalizedToken = token.replace(/\s/g, "");
  if (!/^\d{6}$/.test(normalizedToken)) return false;

  let rawSecret: string | null = null;

  if (isTotpSecretEncrypted(storedSecret)) {
    // Try current encryption key first
    const payload = extractEncryptedPayload(storedSecret);
    if (!payload) return false;

    const isPreviousKey = storedSecret.startsWith(ENCRYPTION_PREFIX_PREVIOUS);
    rawSecret = await decryptFn(payload, isPreviousKey);

    // If previous-key decryption fails, try current key as fallback
    if (!rawSecret && isPreviousKey) {
      rawSecret = await decryptFn(payload, false);
    }
  } else {
    // Legacy plaintext secret — use as-is but flag for rotation
    rawSecret = storedSecret;
  }

  if (!rawSecret) return false;

  return verifyTotpToken(rawSecret, normalizedToken);
}
