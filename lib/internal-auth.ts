/**
 * Shared internal-API auth helpers.
 *
 * The middleware and /api/internal/* routes use a shared secret header to
 * prevent casual external enumeration of internal endpoints. The token is
 * read from INTERNAL_API_TOKEN at runtime.
 *
 * Policy:
 *  - Production runtime (NODE_ENV=production and not a Next.js build phase):
 *    require a non-empty INTERNAL_API_TOKEN. Throws if missing or if the
 *    value matches the documented public dev fallback, so the app fails
 *    fast instead of accepting a known-public token on internal routes.
 *  - Build phases (NEXT_PHASE set): return the dev fallback so `next build`
 *    can complete without runtime secrets.
 *  - Development / test: return the documented dev-only fallback so the app
 *    starts without additional setup.
 *
 * PRODUCTION: set INTERNAL_API_TOKEN to a random 32+ byte secret and add
 * it to your Cloudflare Worker secrets. The deploy workflow already sets
 * it via `wrangler secret put INTERNAL_API_TOKEN`.
 */

/** Header name used between middleware and internal API routes. */
export const INTERNAL_HEADER = "x-internal-token";

/**
 * Dev-only fallback value — MUST NOT be used in production.
 * This constant is public in source and will be rejected at runtime if it
 * ever appears as the configured INTERNAL_API_TOKEN in production.
 */
export const DEV_FALLBACK_INTERNAL_TOKEN = "__dev_only_change_me__";

/**
 * Returns the configured internal API token.
 *
 * Throws in production runtime if INTERNAL_API_TOKEN is missing or equals
 * the documented dev fallback. The throw propagates to:
 *   - /api/internal/resolve-site → Next.js returns 500 (fail-closed),
 *   - middleware self-call → the surrounding try/catch treats the lookup
 *     as failed and the request falls through to "niche not found".
 * Either way, a misconfigured production deploy cannot be queried with
 * the known fallback token.
 */
export function getInternalToken(): string {
  const value = process.env.INTERNAL_API_TOKEN;
  const isBuild = !!process.env.NEXT_PHASE;
  const isProd = process.env.NODE_ENV === "production";

  if (value && value.trim().length > 0) {
    if (isProd && !isBuild && value === DEV_FALLBACK_INTERNAL_TOKEN) {
      throw new Error(
        "INTERNAL_API_TOKEN is set to the documented public dev fallback. " +
          "Refusing to serve internal routes in production.",
      );
    }
    return value;
  }

  if (isProd && !isBuild) {
    throw new Error(
      "INTERNAL_API_TOKEN is required in production. Refusing to serve " +
        "internal routes without a real shared secret.",
    );
  }

  return DEV_FALLBACK_INTERNAL_TOKEN;
}
