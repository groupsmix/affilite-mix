/**
 * F-AUTHZ-01: Signed cookie utility for nh_active_site cookie integrity.
 *
 * Signs cookie values with HMAC-SHA256 using the JWT secret so tampering
 * is detected on read. Format: base64(value.signature).
 */

// A6-03: use purpose-derived HMAC sub-key instead of the raw JWT secret
import { deriveHmacKey } from "@/lib/hmac-key";

async function getHmacKey(usage: KeyUsage[]): Promise<CryptoKey> {
  return deriveHmacKey("signed-cookie", usage);
}

async function hmacSign(data: string): Promise<string> {
  const key = await getHmacKey(["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Constant-time signature verification via Web Crypto. */
async function hmacVerify(data: string, hexSig: string): Promise<boolean> {
  const sigBytes = new Uint8Array((hexSig.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));
  const key = await getHmacKey(["verify"]);
  return crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
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

    if (!(await hmacVerify(payload, sig))) return null;

    const parts = payload.split("|");
    if (parts.length < 3) return null;

    const cookieUserId = parts[parts.length - 2];
    const expiry = Number(parts[parts.length - 1]);

    if (cookieUserId !== userId) return null;
    if (Date.now() > expiry) return null;

    // Value is everything before the last two pipe-separated parts
    return parts.slice(0, -2).join("|");
  } catch {
    // fail-closed: verification error → treat as invalid [criticality:defence-in-depth]
    return null;
  }
}
