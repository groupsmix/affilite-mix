/**
 * Double-submit cookie CSRF protection.
 *
 * When Origin header is missing (some proxies/clients strip it), this provides
 * defence-in-depth: a random token is stored in a cookie and must be sent back
 * as the X-CSRF-Token header on every state-changing request.
 *
 * Flow:
 * 1. GET /api/auth/csrf → sets __csrf cookie + returns { token }.
 * 2. Client stores the token and sends it as X-CSRF-Token on POST/PATCH/DELETE.
 * 3. Middleware compares cookie value with header value (timing-safe).
 *
 * Uses the Web Crypto API exclusively for Cloudflare Workers compatibility.
 */

export const CSRF_COOKIE = "__Host-csrf";
export const CSRF_HEADER = "x-csrf-token";
const TOKEN_BYTES = 32;

/** Generate a cryptographically random CSRF token */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Timing-safe comparison of two strings (Web Crypto API compatible) */
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    // Compare bufA with itself to maintain constant-time behavior
    let result = 0;
    for (let i = 0; i < bufA.byteLength; i++) {
      result |= bufA[i] ^ bufA[i];
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
