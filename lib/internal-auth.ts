/**
 * Shared internal-API auth helpers.
 *
 * The middleware and /api/internal/* routes use a shared secret header to
 * prevent casual external enumeration of internal endpoints.  The token is
 * read from INTERNAL_API_TOKEN at runtime; in development a random per-process
 * fallback is used so the app starts without additional setup.
 *
 * PRODUCTION: set INTERNAL_API_TOKEN to a random 32-byte hex string and add
 * it to your Cloudflare Worker secrets.  The deploy workflow already sets it
 * via `wrangler secret put INTERNAL_API_TOKEN`.
 *
 * SECURITY: The previous static dev fallback ("__dev_only_change_me__") was
 * removed because `requireEnvInProduction` now hard-fails in production,
 * and a predictable string is an unnecessary risk if that guard is ever
 * bypassed.  The dev fallback is now a random UUID generated at process start.
 */
import { requireEnvInProduction } from "@/lib/env";

/** Header name used between middleware and internal API routes. */
export const INTERNAL_HEADER = "x-internal-token";

/**
 * Dev-only fallback — a random value generated once per process so it is
 * never predictable across environments.  In production requireEnvInProduction
 * will throw before this value is ever used.
 */
const DEV_FALLBACK = crypto.randomUUID();

/**
 * Returns the configured internal API token.
 * Throws in production if INTERNAL_API_TOKEN is not set.
 */
export function getInternalToken(): string {
  return requireEnvInProduction("INTERNAL_API_TOKEN", DEV_FALLBACK);
}
