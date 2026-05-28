/** RFC 5321 maximum path length for an email address (audit IV-001). */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Shared email validation utility.
 * Centralizes the email regex used across newsletter signup, admin user creation, etc.
 */
export function isValidEmail(email: string): boolean {
  if (email.length > MAX_EMAIL_LENGTH) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Strip null bytes before length/format checks (audit IV-001 / CWE-1284). */
export function sanitizeEmailInput(email: string): string {
  return email.replace(/\0/g, "");
}

/**
 * Normalize an email address: trim whitespace, lowercase, and apply
 * IDNA/Punycode normalization to the domain part to prevent homoglyph
 * impersonation (S1-A14.5, CWE-1007).
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIdx = trimmed.lastIndexOf("@");
  if (atIdx === -1) return trimmed;

  const local = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx + 1);

  // S1-A14.5: Convert internationalized domain to ASCII (Punycode).
  // URL constructor applies IDNA ToASCII per WHATWG URL spec §3.3.
  // This normalizes "exаmple.com" (Cyrillic а) → "xn--exmple-4pf.com",
  // making homoglyph attacks visible in logs and detectable by policy.
  let normalizedDomain = domain;
  try {
    const url = new URL(`https://${domain}`);
    normalizedDomain = url.hostname;
  } catch {
    // Invalid domain — leave as-is; isValidEmail will reject it.
  }

  return `${local}@${normalizedDomain}`;
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
