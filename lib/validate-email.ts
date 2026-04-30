/**
 * Shared email validation utility.
 * Centralizes the email regex used across newsletter signup, admin user creation, etc.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Normalize an email address: trim whitespace and lowercase.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * F-032: Strip `+` alias tags from emails to prevent rate-limit bypass.
 * e.g., "user+1@example.com" -> "user@example.com".
 * Use ONLY for rate-limiting keys, NOT for storage, so users still get emails.
 */
export function getRateLimitEmailKey(email: string): string {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) return normalized;

  const strippedLocal = localPart.split("+")[0];
  return `${strippedLocal}@${domain}`;
}

/**
 * F-007: Hash email addresses before using them in rate-limit / cache keys.
 *
 * Raw email addresses in operational keys can leak into logs, dashboards,
 * support screenshots, or exported metadata. Hashing with SHA-256 produces
 * a fixed-length, non-reversible key that is equally effective for rate
 * limiting but avoids unnecessary PII exposure.
 *
 * Pipeline: normalize -> strip + aliases -> SHA-256 hex digest (first 32 chars).
 * The 32-char prefix (128 bits) is collision-resistant enough for rate-limit
 * keys while keeping KV storage compact.
 */
export async function hashEmailForRateLimit(email: string): Promise<string> {
  const stripped = getRateLimitEmailKey(email);
  const data = new TextEncoder().encode(stripped);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashHex.slice(0, 32);
}
