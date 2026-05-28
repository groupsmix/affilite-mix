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
// H-10: Replaced the static dev-only fallback with a per-process random.
// A static string in the source is a findable credential; a random value
// is safe by construction and still persists for the isolate lifetime.
import { logger } from "@/lib/logger";

function generateProcessRandom(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const DEV_ONLY_JWT_SECRET = generateProcessRandom();

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
    logger.warn("JWT_SECRET not set — using the documented dev-only fallback", {
      hint: "Set JWT_SECRET in .env for local development and as a Cloudflare Worker secret in production.",
    });
  }
  return DEV_ONLY_JWT_SECRET;
}

/**
 * F-AUTH-03: Returns the previous JWT secret for key rotation grace window.
 * During rotation, tokens signed with the previous key are still accepted
 * until the grace window expires (24h recommended, token TTL is 8h).
 */
function resolveJwtSecretPrevious(env: NodeJS.ProcessEnv = process.env): string | null {
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

const ROTATION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * AUD-09: Enforces that JWT_SECRET_PREVIOUS is not kept past the rotation
 * window. If JWT_SECRET_PREVIOUS is set and JWT_ROTATION_STARTED_AT is
 * either unset or older than 24h, the rotation window has expired.
 *
 * Returns null if everything is fine, or a human-readable error string
 * describing the violation.
 */
export function checkRotationWindowExpiry(env: NodeJS.ProcessEnv = process.env): string | null {
  const prev = env.JWT_SECRET_PREVIOUS;
  if (!prev || prev.trim().length === 0) return null;

  const startedAt = env.JWT_ROTATION_STARTED_AT;
  if (!startedAt || startedAt.trim().length === 0) {
    return (
      "JWT_SECRET_PREVIOUS is set but JWT_ROTATION_STARTED_AT is missing. " +
      "Set JWT_ROTATION_STARTED_AT to the ISO-8601 timestamp when the rotation " +
      "began so the system can enforce the 24h removal window."
    );
  }

  const parsed = Date.parse(startedAt.trim());
  if (Number.isNaN(parsed)) {
    return (
      `JWT_ROTATION_STARTED_AT ("${startedAt}") is not a valid ISO-8601 timestamp. ` +
      "Set it to the time when the rotation began (e.g. 2026-05-28T12:00:00Z)."
    );
  }

  const elapsed = Date.now() - parsed;
  if (elapsed > ROTATION_MAX_AGE_MS) {
    const hoursAgo = Math.round(elapsed / (60 * 60 * 1000));
    return (
      `JWT_SECRET_PREVIOUS has been set for ~${hoursAgo}h (since ${startedAt}), ` +
      "exceeding the 24h rotation window. Remove JWT_SECRET_PREVIOUS and " +
      "JWT_ROTATION_STARTED_AT to complete the rotation."
    );
  }

  return null;
}

/** Test-only helper to reset the memoized secret between test cases. */
export function __resetJwtSecretCacheForTests(): void {
  cached = null;
  cachedAt = 0;
  cachedPrevious = undefined;
  cachedPreviousAt = 0;
  devFallbackWarned = false;
}
