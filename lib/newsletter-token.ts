/**
 * Newsletter token hashing utilities.
 *
 * Confirmation and unsubscribe tokens are stored as SHA-256 hashes
 * to protect against DB leak attacks. The raw tokens are sent to
 * users via email and must NEVER be stored.
 *
 * A98-59: Token expiry — unsubscribe tokens are valid for a limited
 * duration (default 30 days) to reduce the blast radius of leaked tokens.
 */

/** Default token expiry in days (30 days). */
export const DEFAULT_TOKEN_TTL_DAYS = 30;
/** Absolute maximum token age in days (90 days hard cap). */
export const MAX_TOKEN_TTL_DAYS = 90;

/**
 * Hash a newsletter token using SHA-256.
 * Returns a hex string suitable for storage in the database.
 */
export async function hashNewsletterToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify a plain-text token against a stored hash.
 */
export async function verifyNewsletterToken(token: string, hash: string): Promise<boolean> {
  const tokenHash = await hashNewsletterToken(token);
  // Use timing-safe comparison to prevent timing attacks
  if (tokenHash.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < tokenHash.length; i++) {
    result |= tokenHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

/**
 * A98-59: Check if a token's creation date is within the allowed TTL.
 * Returns true if the token has NOT expired (still valid).
 *
 * @param createdAt - ISO date string when the token was created
 * @param ttlDays - Custom TTL in days (defaults to DEFAULT_TOKEN_TTL_DAYS, max MAX_TOKEN_TTL_DAYS)
 */
export function isTokenWithinExpiry(
  createdAt: string | null | undefined,
  ttlDays: number = DEFAULT_TOKEN_TTL_DAYS,
): boolean {
  if (!createdAt) {
    // No creation date — treat as expired in production for safety.
    // In dev, accept for backward-compat.
    return process.env.NODE_ENV !== "production";
  }

  // Clamp TTL to hard cap
  const effectiveTtl = Math.min(ttlDays, MAX_TOKEN_TTL_DAYS);
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;

  const expiry = created + effectiveTtl * 24 * 60 * 60 * 1000;
  return Date.now() <= expiry;
}

/**
 * A98-59: Get the remaining TTL of a token in seconds.
 * Returns 0 if expired.
 */
export function getTokenRemainingTtlSeconds(
  createdAt: string | null | undefined,
  ttlDays: number = DEFAULT_TOKEN_TTL_DAYS,
): number {
  if (!createdAt) return 0;

  const effectiveTtl = Math.min(ttlDays, MAX_TOKEN_TTL_DAYS);
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return 0;

  const expiry = created + effectiveTtl * 24 * 60 * 60 * 1000;
  const remaining = Math.ceil((expiry - Date.now()) / 1000);
  return Math.max(0, remaining);
}
