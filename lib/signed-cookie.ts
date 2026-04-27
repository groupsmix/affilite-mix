/**
 * F-AUTHZ-01: Signed cookie utility for nh_active_site cookie integrity.
 *
 * Signs cookie values with HMAC-SHA256 using the JWT secret so tampering
 * is detected on read. Format: base64(value.signature).
 */

import { getJwtSecret } from "@/lib/jwt-secret";

async function hmacSign(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getJwtSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Sign a cookie value with HMAC-SHA256. The signed value includes the
 * userId and expiry to prevent cross-user or expired replays.
 */
export async function signCookieValue(
  value: string,
  userId: string,
  expiryMs: number = 8 * 60 * 60 * 1000,
): Promise<string> {
  const expiry = Date.now() + expiryMs;
  const payload = `${value}|${userId}|${expiry}`;
  const sig = await hmacSign(payload);
  return btoa(`${payload}.${sig}`);
}

/**
 * Verify and extract the original value from a signed cookie.
 * Returns null if the signature is invalid or the cookie has expired.
 */
export async function verifyCookieValue(
  signedValue: string,
  userId: string,
): Promise<string | null> {
  try {
    const decoded = atob(signedValue);
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return null;

    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);

    const expectedSig = await hmacSign(payload);
    if (sig !== expectedSig) return null;

    const parts = payload.split("|");
    if (parts.length < 3) return null;

    const cookieUserId = parts[parts.length - 2];
    const expiry = Number(parts[parts.length - 1]);

    if (cookieUserId !== userId) return null;
    if (Date.now() > expiry) return null;

    // Value is everything before the last two pipe-separated parts
    return parts.slice(0, -2).join("|");
  } catch {
    return null;
  }
}
