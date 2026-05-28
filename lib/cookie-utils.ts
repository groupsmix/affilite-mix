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
    // fail-open: best-effort
    return match.split("=")[1];
  }
}

/**
 * audit5-#26: canonical inventory of every cookie this app issues that
 * uses the `__Host-` prefix in production. The prefix requires:
 *   - `Secure` flag set
 *   - `Path=/`
 *   - No `Domain` attribute
 * It cannot be satisfied on localhost-over-HTTP, so each entry has a
 * non-prefixed dev/test fallback. A future refactor that "unifies" the
 * cookie name on either side is a regression: in dev the production
 * name fails to parse; in production the dev name loses subdomain
 * isolation.
 *
 * If you add a new `__Host-`-prefixed cookie, add it here. The
 * `__tests__/csrf-timing-safe.test.ts` file pins the names per env so
 * a typo on either side fails the build.
 *
 * @public
 */
export const HOST_PREFIXED_COOKIES = {
  csrf: { prod: "__Host-csrf", dev: "__csrf" },
  // Future entries go here. Keep this object exhaustive.
} as const;
