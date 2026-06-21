import * as OTPAuth from "otpauth";

const ISSUER = "AffiliateMix Admin";
// A6-001: Default to SHA-256 for new enrollments. SHA-1 is still supported
// for verification during a transition period but new secrets use SHA-256.
const DEFAULT_ALGORITHM = "SHA256";
const DIGITS = 6;
const PERIOD = 30;

/**
 * RISK-11 (étap-3): SHA-1 TOTP hard deprecation deadline.
 *
 * After this date, SHA-1 TOTP verification is rejected and users are
 * forced to re-enroll with SHA-256. Set to 90 days from the étap-3
 * audit date (2026-05-29). The advisory `totp_needs_reenroll` flag
 * warns users during the grace period.
 */
const SHA1_DEPRECATION_DEADLINE = new Date("2026-08-27T00:00:00Z");

// A98-53: Markers for encrypted TOTP secrets to distinguish from legacy plaintext
const ENCRYPTION_PREFIX = "enc:v1:";
const ENCRYPTION_PREFIX_PREVIOUS = "enc:v0:";

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
  if (secret.startsWith(ENCRYPTION_PREFIX_PREVIOUS))
    return secret.slice(ENCRYPTION_PREFIX_PREVIOUS.length);
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
 * A6-001: New enrollments use SHA-256 by default. Callers can override via
 * the `algorithm` option during the migration window.
 *
 * SECURITY: The returned secret is raw (unencrypted). Callers MUST encrypt
 * it with encryptTotpSecret() before storing in the database.
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
 *
 * SECURITY: Prefer verifyTotpTokenWithRotation() for DB-stored secrets,
 * as it handles encrypted values and key rotation correctly.
 *
 * NOTE: This returns a plain boolean and does NOT prevent code replay.
 * Use verifyTotpTokenStep() on the login/step-up critical paths where
 * single-use enforcement (NIST 800-63B §5.1.4.2) is required.
 */
export function verifyTotpToken(
  secret: string,
  token: string,
  options?: { algorithm?: TotpAlgorithm },
): boolean {
  // If the secret is an otpauth:// URI, extract both the algorithm and secret from it
  let algorithm: TotpAlgorithm | undefined = options?.algorithm;
  let secretBase32 = secret;
  if (secret.startsWith("otpauth://")) {
    try {
      const parsed = OTPAuth.URI.parse(secret) as OTPAuth.TOTP;
      if (!algorithm) algorithm = parseAlgorithm(parsed.algorithm);
      // A6-001: Use the secret from the parsed URI, not a newly generated random one
      secretBase32 = parsed.secret.base32;
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // If URI parsing fails, fall back to SHA-256 (matches enrollment default)
      algorithm ??= DEFAULT_ALGORITHM;
    }
  }
  // A6-001: Default to SHA-256 to match generateTotpSecret's default — SHA-1 would
  // silently break all new enrollments (SHA-256) when no algorithm is specified.
  algorithm ??= DEFAULT_ALGORITHM;

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  // delta returns null if invalid, or the time step difference if valid
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

/**
 * T1-F4: TOTP period in seconds — exported so callers can compute the consumed
 * time-step and persist it for single-use enforcement.
 */
export const TOTP_PERIOD = PERIOD;

/**
 * T1-F4: Single-use OTP verification — NIST 800-63B §5.1.4.2.
 *
 * Like verifyTotpToken() but returns the accepted time-step so the caller can
 * persist it and reject a replay of the same code within its ~90s window
 * (window:1 = 3 steps × 30s = ±1 step from current).
 *
 * Callers MUST:
 *   1. Call claimTotpStep(userId, step) after receiving { ok: true }.
 *   2. Reject the auth if claimTotpStep returns false (step already consumed).
 *
 * Returns { ok: false } when the token is invalid.
 * Returns { ok: true, step } when valid, where step is the integer counter
 * (Math.floor(Date.now() / 1000 / 30)) of the accepted time window.
 */
export function verifyTotpTokenStep(
  secret: string,
  token: string,
  options?: { algorithm?: TotpAlgorithm },
): { ok: false } | { ok: true; step: number } {
  let algorithm: TotpAlgorithm | undefined = options?.algorithm;
  let secretBase32 = secret;
  if (secret.startsWith("otpauth://")) {
    try {
      const parsed = OTPAuth.URI.parse(secret) as OTPAuth.TOTP;
      if (!algorithm) algorithm = parseAlgorithm(parsed.algorithm);
      secretBase32 = parsed.secret.base32;
    } catch {
      algorithm ??= DEFAULT_ALGORITHM;
    }
  }
  algorithm ??= DEFAULT_ALGORITHM;

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm,
    digits: DIGITS,
    period: PERIOD,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token, window: 1 });
  if (delta === null) return { ok: false };

  // Compute the integer time-step that was actually accepted.
  // currentStep + delta is the counter whose code matched.
  const currentStep = Math.floor(Date.now() / 1000 / PERIOD);
  return { ok: true, step: currentStep + delta };
}

/**
 * E2-009: Detect whether a stored TOTP secret uses the legacy SHA-1 algorithm.
 * Returns true when the secret should be re-enrolled with SHA-256.
 *
 * Detection heuristic (operates on the **stored/encrypted** form):
 *   - enc:v1: prefix → enrolled after SHA-256 became default → OK
 *   - enc:v0: prefix or plaintext → legacy enrollment → needs re-enrollment
 *
 * IMPORTANT: This must be called with the raw stored secret (before decryption),
 * because after decryption all secrets are plain base32 strings and the algorithm
 * cannot be inferred.
 */
export function needsSha256Reenrollment(storedSecret: string | null | undefined): boolean {
  if (!storedSecret) return false;
  // enc:v1: was introduced alongside SHA-256 default — these are current
  if (storedSecret.startsWith("enc:v1:")) return false;
  // enc:v0: or plaintext → legacy SHA-1 era enrollment
  return true;
}

/**
 * RISK-11 (étap-3): Check whether SHA-1 TOTP is past the hard deprecation deadline.
 * After the deadline, legacy SHA-1 secrets are rejected entirely.
 */
export function isSha1TotpPastDeadline(): boolean {
  return new Date() >= SHA1_DEPRECATION_DEADLINE;
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

  // RISK-11 (étap-3): Reject SHA-1 TOTP secrets after the hard deprecation deadline
  if (needsSha256Reenrollment(storedSecret) && isSha1TotpPastDeadline()) {
    return false;
  }

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
