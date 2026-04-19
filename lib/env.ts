/**
 * Shared environment variable helpers.
 */

/**
 * Read an environment variable, **throwing** in production **runtime** if it is
 * missing.  During `next build` (detected via NEXT_PHASE) or in development
 * the provided fallback is returned instead so that the build can complete
 * even when the variables are not yet available (e.g. Vercel preview builds).
 *
 * SECURITY: In production runtime this function **hard-fails** (throws) rather
 * than falling back to a dev default.  This prevents the app from starting
 * with insecure placeholder values for secrets like JWT_SECRET or
 * INTERNAL_API_TOKEN.
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
      `[env] FATAL: Required environment variable ${name} is missing or empty in production. ` +
        `The application cannot start safely without it. ` +
        `Set ${name} in your deployment environment (e.g. \`wrangler secret put ${name}\`).`,
    );
  }
  return fallback;
}
