import { fetchWithTimeout } from "@/lib/fetch-timeout";
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
 * Returns the number of times the password has appeared in breaches,
 * or -1 if the check could not be performed (network error, etc.).
 *
 * This function is async and should be used as a non-blocking check:
 * if it returns -1, the password should still be accepted (fail-open).
 */
export async function checkBreachedPassword(password: string): Promise<number> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);
    const hashHex = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

    const prefix = hashHex.slice(0, 5);
    const suffix = hashHex.slice(5);

    const response = await fetchWithTimeout(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
    });

    if (!response.ok) return -1;

    const body = await response.text();
    const lines = body.split("\n");

    for (const line of lines) {
      const [hashSuffix, count] = line.trim().split(":");
      if (hashSuffix === suffix) {
        return parseInt(count, 10);
      }
    }

    return 0;
  } catch {
    // Fail-open: if the check fails, don't block the user
    return -1;
  }
}
