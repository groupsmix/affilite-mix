/**
 * Shared internal-API auth helpers.
 *
 * A-019: Per-purpose internal API tokens replace a single monolithic secret.
 * Each caller category (click-queue consumer, cron jobs, internal routes)
 * gets its own env var so that a leaked token has the minimum blast radius.
 *
 * F-18: Legacy INTERNAL_API_TOKEN fallback removed in production.
 * Per-purpose tokens are now required in production to enforce blast-radius
 * reduction. The legacy fallback negates the security benefit of per-purpose
 * tokens by allowing a leaked legacy token to access the entire internal surface.
 *
 * Policy:
 *  - Production runtime (NODE_ENV=production and not a Next.js build phase):
 *    require per-purpose tokens. Throws if missing or if the value matches
 *    the documented public dev fallback. Legacy INTERNAL_API_TOKEN is NOT
 *    accepted as a fallback in production.
 *  - Build phases (NEXT_PHASE set): return the dev fallback so `next build`
 *    can complete without runtime secrets.
 *  - Development / test: return the documented dev-only fallback so the app
 *    starts without additional setup.
 *
 * PRODUCTION: set each INTERNAL_API_TOKEN_* to a random 32+ byte secret and
 * add them to your Cloudflare Worker secrets.
 */

/** Header name used between middleware and internal API routes. */
export const INTERNAL_HEADER = "x-internal-token";

/**
 * Dev-only fallback value — MUST NOT be used in production.
 * This constant is public in source and will be rejected at runtime if it
 * ever appears as the configured token in production.
 */
export const DEV_FALLBACK_INTERNAL_TOKEN = "__dev_only_change_me__";

export type InternalTokenPurpose = "click_queue" | "cron" | "internal";

const PURPOSE_ENV_MAP: Record<InternalTokenPurpose, string> = {
  click_queue: "INTERNAL_API_TOKEN_CLICK_QUEUE",
  cron: "INTERNAL_API_TOKEN_CRON",
  internal: "INTERNAL_API_TOKEN_INTERNAL",
};

function validateToken(value: string, isProd: boolean, isBuild: boolean, purpose: string): string {
  if (value && value.trim().length > 0) {
    if (isProd && !isBuild && value === DEV_FALLBACK_INTERNAL_TOKEN) {
      throw new Error(
        `${purpose} is set to the documented public dev fallback. ` +
          `Refusing to serve internal routes in production.`,
      );
    }
    return value;
  }

  if (isProd && !isBuild) {
    throw new Error(
      `${purpose} is required in production. Refusing to serve ` +
        `internal routes without a real shared secret.`,
    );
  }

  return DEV_FALLBACK_INTERNAL_TOKEN;
}

/**
 * Returns the configured internal API token for a specific purpose.
 *
 * F-18: In production, only the purpose-specific token is accepted.
 * The legacy INTERNAL_API_TOKEN fallback is removed in production to
 * enforce blast-radius reduction. In non-production environments, the
 * legacy fallback is still accepted for backward compatibility.
 */
export function getInternalTokenFor(purpose: InternalTokenPurpose): string {
  const envName = PURPOSE_ENV_MAP[purpose];
  const purposeValue = process.env[envName];
  const fallbackValue = process.env.INTERNAL_API_TOKEN;
  const isBuild = !!process.env.NEXT_PHASE;
  const isProd = process.env.NODE_ENV === "production";

  // F-18: In production, require purpose-specific token only
  if (isProd && !isBuild) {
    const value = purposeValue?.trim() || "";
    return validateToken(value, isProd, isBuild, envName);
  }

  // Non-production: fall back to legacy token for backward compatibility
  const value = purposeValue?.trim() || fallbackValue?.trim() || "";
  return validateToken(value, isProd, isBuild, envName);
}

/**
 * @deprecated Use getInternalTokenFor() with a specific purpose.
 * Returns the legacy monolithic internal API token for backward compat.
 */
export function getInternalToken(): string {
  return getInternalTokenFor("internal");
}
