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
