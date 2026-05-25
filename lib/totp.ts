import * as OTPAuth from "otpauth";

const ISSUER = "AffiliateMix Admin";
// A61-001: Keep SHA-1 for backwards compatibility with existing enrollments.
// Existing users' authenticator apps are configured with SHA-1 (encoded in the
// otpauth:// URI at enrollment time). Changing to SHA-256 here without a
// migration path would lock out all currently enrolled admin users.
const ALGORITHM = "SHA1";
const DIGITS = 6;
const PERIOD = 30;

/**
 * Generate a new TOTP secret for enrollment.
 * Returns the secret (base32) and the otpauth:// URI for QR code generation.
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
 * Verify a TOTP token against a secret.
 * Allows a window of ±1 period (30s) to account for clock drift.
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
