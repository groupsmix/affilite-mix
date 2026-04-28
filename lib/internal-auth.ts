/**
 * Shared internal-API auth helpers.
 *
 * A-019: Per-purpose internal API tokens replace a single monolithic secret.
 * Each caller category (click-queue consumer, cron jobs, internal routes)
 * gets its own env var so that a leaked token has the minimum blast radius.
 *
 * Backward compatibility: if the purpose-specific token is unset, the
 * legacy INTERNAL_API_TOKEN is used as a fallback.
 *
 * Policy:
 *  - Production runtime (NODE_ENV=production and not a Next.js build phase):
 *    require a non-empty token. Throws if missing or if the
 *    value matches the documented public dev fallback, so the app fails
 *    fast instead of accepting a known-public token on internal routes.
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
 * Falls back to the legacy INTERNAL_API_TOKEN when the purpose-specific
 * variable is not set.
 */
export function getInternalTokenFor(purpose: InternalTokenPurpose): string {
  const envName = PURPOSE_ENV_MAP[purpose];
  const purposeValue = process.env[envName];
  const fallbackValue = process.env.INTERNAL_API_TOKEN;
  const isBuild = !!process.env.NEXT_PHASE;
  const isProd = process.env.NODE_ENV === "production";

  // Prefer purpose-specific token; fall back to legacy monolithic token.
  const value = purposeValue?.trim() || fallbackValue?.trim() || "";
  return validateToken(value, isProd, isBuild, envName);
}

/**
 * F-SEC-06: Key separation for different cryptographic purposes.
 *
 * INTERNAL_HMAC_SIGNING_KEY - Used for HMAC request signing between
 * Cloudflare Queue/Cron and API routes. Compromise allows request
 * forgery but not cache poisoning.
 *
 * CACHE_INTEGRITY_KEY - Used for HMAC-signing cached affiliate URLs.
 * Compromise allows cache poisoning but not request forgery.
 *
 * Backward compatibility: if the new purpose-specific keys are not set,
 * falls back to INTERNAL_API_TOKEN (the legacy monolithic secret).
 *
 * Production: Set both keys to independent random 32+ byte secrets.
 */
export type KeyPurpose = "hmac_signing" | "cache_integrity";

const KEY_PURPOSE_ENV_MAP: Record<KeyPurpose, string> = {
  hmac_signing: "INTERNAL_HMAC_SIGNING_KEY",
  cache_integrity: "CACHE_INTEGRITY_KEY",
};

/**
 * Get the appropriate secret key for a cryptographic purpose.
 * Implements F-SEC-06 key separation with backward compatibility.
 */
export function getPurposeKey(purpose: KeyPurpose): string {
  const envName = KEY_PURPOSE_ENV_MAP[purpose];
  const purposeValue = process.env[envName];
  const fallbackValue = process.env.INTERNAL_API_TOKEN;
  const isBuild = !!process.env.NEXT_PHASE;
  const isProd = process.env.NODE_ENV === "production";

  // Prefer purpose-specific key; fall back to legacy token.
  const value = purposeValue?.trim() || fallbackValue?.trim() || "";
  return validateToken(value, isProd, isBuild, envName);
}

/**
 * @deprecated Use getInternalTokenFor() with a specific purpose or
 * getPurposeKey() for cryptographic operations.
 * Returns the legacy monolithic internal API token for backward compat.
 */
export function getInternalToken(): string {
  return getInternalTokenFor("internal");
}
