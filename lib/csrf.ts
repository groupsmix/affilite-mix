/**
 * Double-submit cookie CSRF protection.
 *
 * When Origin header is missing (some proxies/clients strip it), this provides
 * defence-in-depth: a random token is stored in a cookie and must be sent back
 * as the X-CSRF-Token header on every state-changing request.
 *
 * Flow:
 * 1. GET /api/auth/csrf → sets `__Host-csrf` cookie (prod) / `__csrf` (dev) + returns { token }.
 * 2. Client stores the token and sends it as X-CSRF-Token on POST/PATCH/DELETE.
 * 3. Middleware compares cookie value with header value (timing-safe).
 *
 * Uses the Web Crypto API exclusively for Cloudflare Workers compatibility.
 */

// H-4: Use __Host- prefix in production to prevent subdomain cookie
// injection. In dev/test environments keep the unprefixed name because
// __Host- requires Secure + Path=/ which localhost doesn't satisfy.
export const CSRF_COOKIE = process.env.NODE_ENV === "production" ? "__Host-csrf" : "__csrf";
export const CSRF_HEADER = "x-csrf-token";
const TOKEN_BYTES = 32;

/** Generate a cryptographically random CSRF token */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fixed iteration count for the mismatched-length branch (F-17: aligned
 * with lib/cron-auth.ts). Using a compile-time constant removes the
 * length side-channel that the previous `Math.max(a,b)` upper bound
 * exposed. 256 comfortably exceeds any realistic CSRF token length.
 *
 * Exported so invariant tests can assert a sane minimum (A11-05 / A8-02).
 */
export const MAX_COMPARE_LEN = 256;

/** Timing-safe comparison of two strings (Web Crypto API compatible) */
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    // G-43: Do NOT "simplify" this branch.
    //
    // F-17: the loop now runs a fixed MAX_COMPARE_LEN iterations rather
    // than max(a, b), so the loop count no longer depends on either
    // token's length. The length mismatch itself is folded into `result`
    // (lenA ^ lenB) so any difference still poisons the accumulator.
    //
    // A11-01: explicit guard replaces the unreachable `|| 1` fallback.
    if (bufA.byteLength === 0 || bufB.byteLength === 0) return false;
    const lenA = bufA.byteLength;
    const lenB = bufB.byteLength;
    let result = 0;
    result |= lenA ^ lenB;
    for (let i = 0; i < MAX_COMPARE_LEN; i++) {
      result |= bufA[i % lenA] ^ bufB[i % lenB];
    }
    void result;
    return false;
  }
  // A3-02 / A7-04: Cap the equal-length loop to MAX_COMPARE_LEN so a
  // future increase in TOKEN_BYTES cannot make the loop unbounded.
  const eqLen = Math.min(bufA.byteLength, MAX_COMPARE_LEN);
  let result = 0;
  for (let i = 0; i < eqLen; i++) {
    result |= bufA[i] ^ bufB[i];
  }
  return result === 0;
}

/**
 * Validate the CSRF double-submit cookie.
 * Returns true if the cookie and header match (timing-safe).
 */
export function validateCsrfToken(
  cookieValue: string | undefined,
  headerValue: string | undefined,
): boolean {
  // A3-02: Reject oversize tokens before reaching the timing path.
  if (cookieValue && cookieValue.length > MAX_COMPARE_LEN) return false;
  if (headerValue && headerValue.length > MAX_COMPARE_LEN) return false;
  // A3-01: Run the constant-time path even when inputs are missing so
  // the empty-vs-wrong timing distinguisher is eliminated.
  if (!cookieValue || !headerValue) {
    return timingSafeCompare(cookieValue || "x", headerValue || "y");
  }
  return timingSafeCompare(cookieValue, headerValue);
}
