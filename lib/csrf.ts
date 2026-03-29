/**
 * CSRF double-submit cookie utilities.
 *
 * Issues a random CSRF token as an httpOnly cookie and exposes it via a
 * GET endpoint. Clients attach the token as an `x-csrf-token` header on
 * state-changing requests. The middleware validates that the header value
 * matches the cookie value using timing-safe comparison.
 */

import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

export const CSRF_COOKIE = "nh_csrf";
const TOKEN_BYTES = 32;

/** Generate a hex-encoded random CSRF token */
export function generateCsrfToken(): string {
  const buf = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(buf);
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Read the current CSRF token from the cookie jar (server-side) */
export async function getCsrfTokenFromCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(CSRF_COOKIE)?.value;
}

/**
 * Compare two CSRF tokens in constant time.
 * Returns false if either token is missing or they differ.
 */
export function csrfTokensMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    // Compare against self to keep timing constant, then return false
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
