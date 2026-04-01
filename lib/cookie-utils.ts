/**
 * Whether cookies should be marked as Secure (HTTPS-only).
 * True in production, false in local development.
 */
export const IS_SECURE_COOKIE = process.env.NODE_ENV === "production";

/**
 * Safe cookie parsing utility.
 * Handles URL decoding and edge cases.
 */
export function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  try {
    return decodeURIComponent(match.split("=")[1]);
  } catch {
    return match.split("=")[1];
  }
}
