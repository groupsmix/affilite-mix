/**
 * Shared environment variable helpers.
 */

/**
 * F9: Refuse to start in production if ALLOW_LOCALHOST_FALLBACK_IN_PROD is set.
 * This flag is only for CI builds (Lighthouse, smoke tests). If it leaks into
 * a real prod deploy, it weakens tenant resolution by allowing localhost
 * fallback sites. The assertion runs at module-load time so the Worker fails
 * fast before serving any request.
 */
if (
  process.env.NODE_ENV === "production" &&
  !process.env.NEXT_PHASE &&
  process.env.ALLOW_LOCALHOST_FALLBACK_IN_PROD === "1" &&
  process.env.CI !== "true" &&
  process.env.GITHUB_ACTIONS !== "true"
) {
  throw new Error(
    "[env] ALLOW_LOCALHOST_FALLBACK_IN_PROD=1 is set in a production runtime. " +
      "This flag is only for CI/Lighthouse runs. Remove it from the production " +
      "environment to prevent localhost tenant-resolution bypass.",
  );
}

/**
 * F8: Log missing per-trigger cron secrets at startup so silent cron
 * failures (data-retention, commission-ingest) are caught early.
 * We import the secret list lazily to avoid circular deps.
 */
if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
  // Defer to avoid blocking module init; the registry is a plain data module.
  void Promise.resolve().then(async () => {
    try {
      const { listAllCronSecretEnvVars } = await import("./cron-registry");
      const missing = listAllCronSecretEnvVars().filter((name) => !process.env[name]?.trim());
      if (missing.length > 0) {
        console.warn(
          `[env] F8: ${missing.length} cron secret(s) missing in production: ${missing.join(", ")}. ` +
            "Affected crons will fail to authenticate.",
        );
      }
    } catch {
      // fail-safe: registry import failure should not crash the Worker
    }
  });
}

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
