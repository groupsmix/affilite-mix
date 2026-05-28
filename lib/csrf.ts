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
 */
const MAX_COMPARE_LEN = 256;

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
    const lenA = bufA.byteLength || 1;
    const lenB = bufB.byteLength || 1;
    let result = 0;
    result |= lenA ^ lenB;
    for (let i = 0; i < MAX_COMPARE_LEN; i++) {
      result |= bufA[i % lenA] ^ bufB[i % lenB];
    }
    void result;
    return false;
  }
  let result = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
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
  if (!cookieValue || !headerValue) return false;
  return timingSafeCompare(cookieValue, headerValue);
}
