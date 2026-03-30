/**
 * Shared validation utilities used across API routes and forms.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate an email address format. */
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}
