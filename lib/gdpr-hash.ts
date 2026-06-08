/**
 * CF-03 / F-012: Dedicated GDPR PII hashing, decoupled from auth secrets.
 *
 * Privacy audit logging needs a stable, non-reversible identifier for an
 * email so erasure / export / rectification actions can be correlated in
 * the audit log without storing the raw address. This MUST use a
 * dedicated secret (`GDPR_HASH_SECRET`) and never the auth signing key:
 *
 *   - Rotating JWT_SECRET during an auth incident would otherwise silently
 *     break GDPR audit-log correlation (the same email would hash to a new
 *     value), undermining the very compliance trail it exists for.
 *   - A leaked JWT_SECRET would additionally expose the PII-hashing
 *     keyspace, letting an attacker confirm whether a known email appears
 *     in the logs (dictionary attack).
 *
 * `GDPR_HASH_SECRET` is required in production via lib/server-env.ts
 * (FEATURE_CONDITIONAL_ENV, CF-03) and documented in .env.example. This
 * helper therefore refuses to fall back to JWT_SECRET — the previous
 * per-route `GDPR_HASH_SECRET || JWT_SECRET` fallback re-coupled privacy
 * hashing to auth and is exactly the issue F-012 flagged.
 *
 * The digest (HMAC-SHA256 over the normalised email, hex, first 16 chars)
 * is byte-for-byte identical to the previous per-route implementations so
 * existing stored hashes continue to correlate after this change.
 */
import crypto from "crypto";

/**
 * Returns a stable, non-reversible 16-hex-char identifier for an email,
 * suitable for GDPR audit logs.
 *
 * @throws if GDPR_HASH_SECRET is unset/empty, so PII is never hashed with
 *         a shared, hardcoded, or auth-derived key.
 */
export function hashEmailForGdpr(email: string): string {
  const secret = process.env.GDPR_HASH_SECRET;
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      "GDPR_HASH_SECRET must be set — refusing to hash PII with a shared or auth-derived " +
        "fallback. It is required in production (lib/server-env.ts, CF-03) and documented " +
        "in .env.example.",
    );
  }
  return crypto
    .createHmac("sha256", secret)
    .update(email.toLowerCase().trim())
    .digest("hex")
    .substring(0, 16);
}
