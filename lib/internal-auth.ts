/**
 * Shared internal-API auth helpers.
 *
 * The middleware and /api/internal/* routes use a shared secret header to
 * prevent casual external enumeration of internal endpoints.  The token is
 * read from INTERNAL_API_TOKEN at runtime; in development a predictable
 * fallback is used so the app starts without additional setup.
 *
 * PRODUCTION: set INTERNAL_API_TOKEN to a random 32-byte hex string and add
 * it to your Cloudflare Worker secrets.  The deploy workflow already sets it
 * via `wrangler secret put INTERNAL_API_TOKEN`.
 */
import { requireEnvInProduction } from "@/lib/env";

/** Header name used between middleware and internal API routes. */
export const INTERNAL_HEADER = "x-internal-token";

/** Dev-only fallback value — never deploy without overriding INTERNAL_API_TOKEN. */
const DEV_FALLBACK = "__dev_only_change_me__";

/**
 * Returns the configured internal API token.
 * Throws in production if INTERNAL_API_TOKEN is not set.
 */
export function getInternalToken(): string {
  const token = requireEnvInProduction("INTERNAL_API_TOKEN", DEV_FALLBACK);
  if (token === DEV_FALLBACK && process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
    throw new Error(
      "INTERNAL_API_TOKEN is using the dev fallback in production. " +
        "Set INTERNAL_API_TOKEN via `wrangler secret put INTERNAL_API_TOKEN`.",
    );
  }
  return token;
}
