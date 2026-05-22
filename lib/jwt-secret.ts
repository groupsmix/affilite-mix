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
// A2-02: Not exported — this string must never be accessible outside this
// module so static analysis tools and grep sweeps cannot identify it as a
// reachable secret.  All callers go through getJwtSecret() which gates on
// NODE_ENV so it is never returned in production.
const DEV_ONLY_JWT_SECRET = "__dev_only_insecure_jwt_secret__";

let devFallbackWarned = false;

/**
 * Resolves the JWT secret according to the policy above.
 *
 * Exported for unit testing; runtime callers should use `getJwtSecret`
 * which memoizes the resolved value.
 */
export function resolveJwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  // F-AUTH-03: Prefer JWT_SECRET_CURRENT for key rotation support.
  const current = env.JWT_SECRET_CURRENT;
  if (current && current.trim().length > 0) return current;

  const value = env.JWT_SECRET;
  const isBuild = !!env.NEXT_PHASE;
  const isProd = env.NODE_ENV === "production";

  if (value && value.trim().length > 0) return value;

  if (isProd && !isBuild) {
    throw new Error(
      "JWT_SECRET (or JWT_SECRET_CURRENT) is required in production. Refusing to boot with a random " +
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

/**
 * F-AUTH-03: Returns the previous JWT secret for key rotation grace window.
 * During rotation, tokens signed with the previous key are still accepted
 * until the grace window expires (24h recommended, token TTL is 8h).
 */
export function resolveJwtSecretPrevious(env: NodeJS.ProcessEnv = process.env): string | null {
  const prev = env.JWT_SECRET_PREVIOUS;
  if (prev && prev.trim().length > 0) return prev;
  return null;
}

// FIX-12 (F-007, F-032): Re-read JWT secret per mint instead of caching
// for the entire isolate lifetime. On Cloudflare Workers, env vars can
// be updated via `wrangler secret put` without a redeploy; the cached
// value would keep signing with the old key until the next cold start.
// We still cache for a short window (5 minutes) to avoid re-reading the
// env var on every single request.
let cached: string | null = null;
let cachedAt: number = 0;
const SECRET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedPrevious: string | null | undefined = undefined;
let cachedPreviousAt: number = 0;

/**
 * Returns the current JWT secret, re-reading from env at most every 5 minutes.
 */
export function getJwtSecret(): string {
  const now = Date.now();
  if (cached !== null && now - cachedAt < SECRET_CACHE_TTL_MS) return cached;
  cached = resolveJwtSecret();
  cachedAt = now;
  return cached;
}

/**
 * F-AUTH-03: Returns the previous JWT secret for rotation grace window.
 * Returns null if no previous secret is configured.
 */
export function getJwtSecretPrevious(): string | null {
  const now = Date.now();
  if (cachedPrevious !== undefined && now - cachedPreviousAt < SECRET_CACHE_TTL_MS)
    return cachedPrevious;
  cachedPrevious = resolveJwtSecretPrevious();
  cachedPreviousAt = now;
  return cachedPrevious;
}

/**
 * FIX-12 (F-032): Derive a key ID from the secret for the JWT `kid` header.
 * Uses the first 8 hex chars of a SHA-256 hash of the secret so that
 * different secrets produce different kids, but the same secret always
 * produces the same kid. This lets verifiers identify which key was used
 * without exposing the secret itself.
 */
export async function getJwtKid(): Promise<string> {
  const secret = getJwtSecret();
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Test-only helper to reset the memoized secret between test cases. */
export function __resetJwtSecretCacheForTests(): void {
  cached = null;
  cachedAt = 0;
  cachedPrevious = undefined;
  cachedPreviousAt = 0;
  devFallbackWarned = false;
}
