/**
 * Shared environment variable helpers.
 */

/**
 * Read an environment variable, throwing in production **runtime** if it is
 * missing.  During `next build` (detected via NEXT_PHASE) or in development
 * the provided fallback is returned instead so that the build can complete
 * even when the variables are not yet available (e.g. Vercel preview builds).
 */
export function requireEnvInProduction(name: string, fallback: string): string {
  const value = process.env[name];

  // Treat empty strings as missing
  if (value && value.trim().length > 0) return value;

  // NEXT_PHASE is set by Next.js during builds (e.g. "phase-production-build").
  // We must not throw during the build or static-generation phases because the
  // env vars may only be injected at runtime.
  const isBuild = !!process.env.NEXT_PHASE;

  if (process.env.NODE_ENV === "production" && !isBuild) {
    throw new Error(
      `[env] Required environment variable ${name} is missing or empty in production. ` +
        `Set it in your Cloudflare Worker secrets or .env file.`,
    );
  }
  return fallback;
}
