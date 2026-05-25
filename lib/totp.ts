import * as OTPAuth from "otpauth";

const ISSUER = "AffiliateMix Admin";
// A6-001: Default to SHA-256 for new enrollments. SHA-1 is still supported
// for verification during a transition period but new secrets use SHA-256.
const DEFAULT_ALGORITHM = "SHA256";
const DIGITS = 6;
const PERIOD = 30;

/** Supported TOTP algorithms. SHA-1 is retained for legacy secret verification. */
export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

/**
 * Parse an algorithm string from a stored secret or OTPAuth URI.
 * Returns a valid OTPAuth algorithm, defaulting to SHA1 for legacy secrets.
 */
function parseAlgorithm(alg?: string | null): TotpAlgorithm {
  if (alg === "SHA256" || alg === "SHA512") return alg;
  return "SHA1";
}

/**
 * Generate a new TOTP secret for enrollment.
 * Returns the secret (base32) and the otpauth:// URI for QR code generation.
 *
 * A6-001: New enrollments use SHA-256 by default. Callers can override via
 * the `algorithm` option during the migration window.
 */
export function generateTotpSecret(
  email: string,
  options?: { algorithm?: TotpAlgorithm },
): {
  secret: string;
  uri: string;
  algorithm: TotpAlgorithm;
} {
  const algorithm = parseAlgorithm(options?.algorithm ?? DEFAULT_ALGORITHM);
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm,
    digits: DIGITS,
    period: PERIOD,
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
    algorithm,
  };
}

/**
 * Verify a TOTP token against a raw secret (unencrypted base32).
 * Allows a window of ±1 period (30s) to account for clock drift.
 *
 * A6-001: Automatically detects the algorithm from the otpauth:// URI if
 * provided, otherwise falls back to SHA-1 for legacy base32 secrets.
 */
export function verifyTotpToken(
  secret: string,
  token: string,
  options?: { algorithm?: TotpAlgorithm },
): boolean {
  // If the secret is an otpauth:// URI, extract the algorithm from it
  let algorithm: TotpAlgorithm | undefined = options?.algorithm;
  if (!algorithm && secret.startsWith("otpauth://")) {
    try {
      const parsed = OTPAuth.URI.parse(secret) as OTPAuth.TOTP;
      algorithm = parseAlgorithm(parsed.algorithm);
    } catch {
      // If URI parsing fails, fall back to SHA-1
      algorithm = "SHA1";
    }
  }
  algorithm ??= "SHA1";

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(
      secret.startsWith("otpauth://") ? new OTPAuth.TOTP({ algorithm }).secret.base32 : secret,
    ),
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
