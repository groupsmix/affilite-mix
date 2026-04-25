import { getKVNamespace } from "@/lib/rate-limit"; // Reuse the KV fetcher
import { logger } from "@/lib/logger";

const REVOKED_TTL_SECONDS = 86400; // 24 hours (matches token expiry)

/**
 * Check if a JWT ID (jti) is present in the blocklist.
 * Fails closed (blocks token) if KV is unavailable in production, to prevent
 * compromised tokens from being used during outages.
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  const isProduction = process.env.NODE_ENV === "production" || typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  try {
    const kv = getKVNamespace();
    if (!kv) {
      if (isProduction) {
        logger.error("KV unavailable, failing closed for JWT revocation check", { jti });
        return true;
      }
      return false;
    }

    const value = await kv.get(`revoked:${jti}`);
    return value !== null;
  } catch (err) {
    logger.error("Failed to check token revocation status", { jti, error: String(err) });
    return isProduction; // Fail closed in prod, open in dev
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
