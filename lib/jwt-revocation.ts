import { getKVNamespace } from "@/lib/rate-limit"; // Reuse the KV fetcher
import { logger } from "@/lib/logger";
import { REVOKED_JWT_TTL_SECONDS } from "@/lib/auth-constants";

// Derived from the single JWT-expiry constant so the KV blocklist
// always outlives any token signed with the matching expiry. See
// `lib/auth-constants.ts` for the rationale.
const REVOKED_TTL_SECONDS = REVOKED_JWT_TTL_SECONDS;

/**
 * Check if a JWT ID (jti) is present in the blocklist.
 *
 * KV-outage behaviour is controlled by `failClosed`:
 *   - failClosed=false (default): on KV unavailability, fail OPEN (return
 *     false / not-revoked). Revocation is now checked by default (see
 *     verifyToken), and failing closed on every KV blip would lock every
 *     admin out — a worse outage than the gap revocation closes. The
 *     attacker's window during a KV outage is bounded by the 4h token TTL.
 *   - failClosed=true (operator sets ADMIN_SESSION_TOKEN_REVOCATION_STRICT
 *     =true): on KV unavailability in production, fail CLOSED (block the
 *     token) so a compromised token cannot be replayed during an outage.
 */
export async function isTokenRevoked(
  jti: string,
  opts?: { failClosed?: boolean },
): Promise<boolean> {
  const failClosed = opts?.failClosed ?? false;
  const isProduction =
    process.env.NODE_ENV === "production" ||
    (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers");
  try {
    const kv = getKVNamespace();
    if (!kv) {
      if (isProduction && failClosed) {
        logger.error("KV unavailable, failing closed for JWT revocation check (strict)", { jti });
        return true;
      }
      return false;
    }

    const value = await kv.get(`revoked:${jti}`);
    return value !== null;
  } catch (err) {
    logger.error("Failed to check token revocation status", { jti, error: String(err) });
    return isProduction && failClosed; // Fail closed only when strict mode is enabled
  }
}

/**
 * Add a JWT ID to the blocklist until it naturally expires.
 */
export async function revokeToken(jti: string): Promise<void> {
  try {
    const kv = getKVNamespace();
    if (!kv) {
      logger.warn("Cannot revoke token because KV is unavailable", { jti });
      return;
    }

    await kv.put(`revoked:${jti}`, "1", { expirationTtl: REVOKED_TTL_SECONDS });
    logger.info("Token revoked successfully", { jti });
  } catch (err) {
    logger.error("Failed to revoke token", { jti, error: String(err) });
  }
}

/**
 * High-5 FIX: Per-user session-invalidation floor.
 *
 * jti revocation targets a single token. Password reset must invalidate
 * EVERY session a user holds — including sessions on other devices and the
 * email-link reset path, which carries no admin cookie and therefore no jti
 * to revoke. We store a Unix-epoch-seconds cutoff in KV; `verifyToken`
 * rejects any token whose `session_start`/`iat` predates it.
 */
export async function revokeUserSessions(userId: string): Promise<void> {
  try {
    const kv = getKVNamespace();
    if (!kv) {
      logger.warn("Cannot revoke user sessions because KV is unavailable", { userId });
      return;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    await kv.put(`user-revoked:${userId}`, String(nowSeconds), {
      expirationTtl: REVOKED_TTL_SECONDS,
    });
    logger.info("All user sessions revoked", { userId, before: nowSeconds });
  } catch (err) {
    logger.error("Failed to revoke user sessions", { userId, error: String(err) });
  }
}

/**
 * Return the epoch-seconds cutoff before which all of this user's sessions
 * are invalid, or null if none is set.
 *
 * Fails OPEN (returns null) on error: the jti-based check already fails
 * closed during KV outages, so a token cannot slip through both — there is
 * no need to double-block here and risk locking every user out on a blip.
 */
export async function getUserSessionInvalidBefore(userId: string): Promise<number | null> {
  try {
    const kv = getKVNamespace();
    if (!kv) return null;
    const value = await kv.get(`user-revoked:${userId}`);
    if (value === null) return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (err) {
    logger.error("Failed to read user session floor", { userId, error: String(err) });
    return null;
  }
}
