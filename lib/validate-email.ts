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
