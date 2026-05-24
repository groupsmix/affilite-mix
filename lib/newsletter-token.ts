/**
 * Newsletter token hashing utilities.
 *
 * Confirmation and unsubscribe tokens are stored as SHA-256 hashes
 * to protect against DB leak attacks. The raw tokens are sent to
 * users via email and must NEVER be stored.
 */

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
 * A100-11: Token expiry validation for newsletter unsubscribe tokens.
 * Tokens expire after 30 days. Check the subscriber's `token_issued_at`
 * field against this threshold.
 */
const UNSUBSCRIBE_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function isUnsubscribeTokenExpired(tokenIssuedAt: string | null | undefined): boolean {
  if (!tokenIssuedAt) return false; // Legacy tokens without issued_at are accepted
  const issued = new Date(tokenIssuedAt).getTime();
  if (isNaN(issued)) return false;
  return Date.now() - issued > UNSUBSCRIBE_TOKEN_MAX_AGE_MS;
}
