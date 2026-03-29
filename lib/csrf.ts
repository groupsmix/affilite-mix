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
 */

import { timingSafeEqual, webcrypto } from "crypto";

export const CSRF_COOKIE = "__csrf";
export const CSRF_HEADER = "x-csrf-token";
const TOKEN_BYTES = 32;

/** Generate a cryptographically random CSRF token */
export function generateCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  webcrypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Timing-safe comparison of two strings */
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
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
