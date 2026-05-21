/**
 * F-029: In Cloudflare Workers, NODE_ENV must be set to "production" for the
 * deployed worker. If we ever observe Workers' user-agent at runtime without
 * NODE_ENV === "production", that's a deploy misconfiguration — surface it
 * loudly rather than silently coercing IS_SECURE_COOKIE to true. This is the
 * inverted "this should never happen in dev" guard recommended by the audit.
 */
if (
  process.env.NODE_ENV !== "production" &&
  typeof navigator !== "undefined" &&
  navigator.userAgent === "Cloudflare-Workers"
) {
  throw new Error(
    "Detected Cloudflare-Workers runtime but NODE_ENV is not 'production'. " +
      "Set NODE_ENV=production in the worker environment so secure cookies " +
      "are emitted correctly.",
  );
}

/**
 * Whether cookies should be marked as Secure (HTTPS-only).
 * Driven solely by NODE_ENV: true in production, false everywhere else.
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
