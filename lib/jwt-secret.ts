/**
 * Resolves the JWT signing secret used by admin session tokens and preview
 * tokens.
 *
 * Behavior:
 *  - Production runtime (NODE_ENV=production and not a Next.js build phase):
 *    requires a non-empty JWT_SECRET. Throws if missing so the app fails fast
 *    instead of silently signing tokens with a per-process random secret.
 *  - Build phases (NEXT_PHASE is set, e.g. during `next build`): returns the
 *    documented dev fallback so static generation can run without secrets.
 *  - Development / test: returns a stable documented dev-only fallback and
 *    emits a single warning so local sessions persist across restarts.
 *
 * There is deliberately no random per-process fallback: on Cloudflare Workers
 * (the production target) isolates are torn down frequently, which would
 * invalidate every outstanding session on cold start.
 */

/**
 * Dev-only JWT secret. Only used when NODE_ENV !== "production" or during
 * a Next.js build phase. Must never be used to sign tokens in production.
 */
export const DEV_ONLY_JWT_SECRET = "__dev_only_insecure_jwt_secret__";

let devFallbackWarned = false;

/**
 * Resolves the JWT secret according to the policy above.
 *
 * Exported for unit testing; runtime callers should use `getJwtSecret`
 * which memoizes the resolved value.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.JWT_SECRET;
  const isBuild = !!env.NEXT_PHASE;
  const isProd = env.NODE_ENV === "production";

  if (value && value.trim().length > 0) return value;

  if (isProd && !isBuild) {
    throw new Error(
      "JWT_SECRET is required in production. Refusing to boot with a random " +
        "per-process fallback — it would invalidate sessions on every cold start.",
    );
  }

  if (!devFallbackWarned) {
    devFallbackWarned = true;
    console.warn(
      "JWT_SECRET not set — using the documented dev-only fallback. " +
        "Set JWT_SECRET in .env for local development and as a Cloudflare " +
        "Worker secret in production.",
    );
  }
  return DEV_ONLY_JWT_SECRET;
}

let cached: string | null = null;

/**
 * Returns the JWT secret, resolving and memoizing it on first call.
 */
export function getJwtSecret(): string {
  if (cached !== null) return cached;
  cached = resolveJwtSecret();
  return cached;
}

/** Test-only helper to reset the memoized secret between test cases. */
export function __resetJwtSecretCacheForTests(): void {
  cached = null;
  devFallbackWarned = false;
}
