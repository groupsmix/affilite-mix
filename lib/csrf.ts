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

export const CSRF_COOKIE = "__csrf";
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
    // G-43: Do NOT "simplify" this branch.
    //
    // Returning early on a length mismatch would already leak length, but
    // we additionally walk bufA against bufB (with modular indexing on the
    // shorter buffer) so the work performed in the mismatched-length
    // branch is data-dependent and structurally similar to the equal-
    // length branch below. Earlier revisions did `bufA[i] ^ bufA[i]`,
    // which is algebraically 0 and which an optimising JIT could prove
    // dead (collapsing the loop and reintroducing a timing side-channel
    // even with `void result` observing the sink). Using `bufB[i % len]`
    // produces values the compiler cannot fold away.
    //
    // The walk length is capped at `max(bufA, bufB)` so the loop body
    // count is independent of which side was longer. Removing the loop,
    // dropping the `void`, or replacing the body with a constant would
    // let the optimiser collapse the branch.
    const longer = bufA.byteLength > bufB.byteLength ? bufA.byteLength : bufB.byteLength;
    const lenB = bufB.byteLength || 1;
    const lenA = bufA.byteLength || 1;
    let result = 0;
    for (let i = 0; i < longer; i++) {
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
