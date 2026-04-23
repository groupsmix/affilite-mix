/**
 * Reset token hashing utilities.
 *
 * Tokens are stored as SHA-256 hashes to protect against DB leak attacks.
 * The raw token is sent to the user via email and must NEVER be stored.
 */

/**
 * Hash a reset token using SHA-256.
 * Returns a hex string suitable for storage in the database.
 */
export async function hashResetToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verify a plain-text token against a stored hash.
 */
export async function verifyResetToken(token: string, hash: string): Promise<boolean> {
  const tokenHash = await hashResetToken(token);
  // Use timing-safe comparison to prevent timing attacks
  if (tokenHash.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < tokenHash.length; i++) {
    result |= tokenHash.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}