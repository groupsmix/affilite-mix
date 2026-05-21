/**
 * Shared environment variable helpers.
 */

/**
 * Read an environment variable. In production **runtime** the function
 * throws if the variable is missing or empty so that misconfiguration
 * surfaces as an immediate, explicit failure instead of silently
 * degrading into a placeholder client (which used to cause every
 * downstream call to "succeed" against a non-existent backend).
 *
 * During `next build` (detected via `NEXT_PHASE`) or outside of
 * production the provided fallback is returned so that builds and local
 * dev work without the secret being available (e.g. Vercel preview
 * builds, CI typecheck runs).
 *
 * @param name - Environment variable name.
 * @param fallback - Value returned in development / build phase when
 *   the variable is missing. Defaults to an empty string.
 * @throws {Error} In production runtime when the variable is missing or
 *   contains only whitespace.
 */
export function requireEnvInProduction(name: string, fallback = ""): string {
  const value = process.env[name];

  // Treat empty strings as missing
  if (value && value.trim().length > 0) return value;

  // NEXT_PHASE is set by Next.js during builds (e.g. "phase-production-build").
  // We must not throw during the build or static-generation phases because the
  // env vars may only be injected at runtime.
  const isBuild = !!process.env.NEXT_PHASE;

  if (process.env.NODE_ENV === "production" && !isBuild) {
    throw new Error(
      `[env] Required environment variable "${name}" is missing or empty in production. ` +
        "Refusing to start with an insecure or placeholder fallback. " +
        "Set this variable in your deployment environment (e.g. Cloudflare Workers secrets, Vercel env vars) and redeploy.",
    );
  }
  return fallback;
}
