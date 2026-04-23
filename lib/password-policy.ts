/**
 * Password policy enforcement.
 *
 * Provides:
 *   1. Complexity validation (length, uppercase, lowercase, digit, special char)
 *   2. HaveIBeenPwned k-anonymity check (optional, non-blocking)
 *
 * The HIBP check uses the k-anonymity range API: only the first 5 characters
 * of the SHA-1 hash are sent to the API, so the full password is never exposed.
 */

const MIN_LENGTH = 8;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_LOWERCASE = /[a-z]/;
const HAS_DIGIT = /\d/;
const HAS_SPECIAL = /[^A-Za-z0-9]/;

export interface PasswordPolicyResult {
  valid: boolean;
  error: string | null;
}

/**
 * Validate password against complexity requirements.
 * Returns { valid: true } or { valid: false, error: "..." }.
 */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  if (!password || password.length < MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_LENGTH} characters` };
  }
  if (!HAS_UPPERCASE.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  if (!HAS_LOWERCASE.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  if (!HAS_DIGIT.test(password)) {
    return { valid: false, error: "Password must contain at least one digit" };
  }
  if (!HAS_SPECIAL.test(password)) {
    return { valid: false, error: "Password must contain at least one special character" };
  }
  return { valid: true, error: null };
}

/**
 * Check whether a password appears in known data breaches using the
 * HaveIBeenPwned Passwords API (k-anonymity range search).
 *
 * Only the first 5 hex characters of the SHA-1 hash are sent to the API.
 * Returns the number of times the password has appeared in breaches.
 *
 * This function is blocking: if the API check fails (network error, etc.),
 * it throws an error. Callers should catch and handle appropriately.
 * For production security, we fail-closed on API errors to prevent
 * accepting potentially compromised passwords when the breach check
 * service is unavailable.
 */
export async function checkBreachedPassword(password: string): Promise<number> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  const prefix = hashHex.slice(0, 5);
  const suffix = hashHex.slice(5);

  const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { "Add-Padding": "true" },
    signal: AbortSignal.timeout(5000), // 5 second timeout
  });

  if (!response.ok) {
    throw new Error(`HIBP API returned ${response.status}`);
  }

  const body = await response.text();
  const lines = body.split("\n");

  for (const line of lines) {
    const [hashSuffix, count] = line.trim().split(":");
    if (hashSuffix === suffix) {
      return parseInt(count, 10);
    }
  }

  return 0;
}
