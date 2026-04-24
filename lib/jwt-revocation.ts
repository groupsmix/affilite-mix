import { getKVNamespace } from "@/lib/rate-limit"; // Reuse the KV fetcher
import { logger } from "@/lib/logger";

const REVOKED_TTL_SECONDS = 86400; // 24 hours (matches token expiry)

/**
 * Check if a JWT ID (jti) is present in the blocklist.
 * Fails open (allows token) if KV is unavailable, to prevent
 * outages if Cloudflare KV goes down.
 */
export async function isTokenRevoked(jti: string): Promise<boolean> {
  try {
    const kv = getKVNamespace();
    if (!kv) return false;

    const value = await kv.get(`revoked:${jti}`);
    return value !== null;
  } catch (err) {
    logger.error("Failed to check token revocation status", { jti, error: String(err) });
    return false; // Fail open
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
