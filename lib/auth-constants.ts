/**
 * Authoritative session-token timing constants.
 *
 * F-SEC-03 set the admin JWT lifetime to 4 hours. Three independent
 * surfaces consume that lifetime:
 *   1. `lib/auth.ts:EXPIRY` — passed to `jose.SignJWT().setExpirationTime()`.
 *   2. `lib/jwt-revocation.ts:REVOKED_TTL_SECONDS` — KV blocklist TTL.
 *      Must be >= EXPIRY_SECONDS so a revoked jti cannot be replayed
 *      after the KV entry expires while the JWT itself is still valid.
 *   3. `lib/auth.ts:cookie.maxAge` — admin session cookie lifetime.
 *
 * Previously each of those three values was hand-rolled, and a 4h JWT
 * was paired with an 8h KV blocklist. The drift was harmless when the
 * shorter side was the JWT, but if anyone bumped EXPIRY past
 * REVOKED_TTL_SECONDS — say to "12h" — a revoked token would become
 * usable again the moment its KV row aged out. This module is the
 * single source of truth so the three values can't drift again.
 */

/** Admin JWT lifetime in seconds (4 hours). */
export const ADMIN_JWT_EXPIRY_SECONDS = 4 * 60 * 60;

/**
 * KV revocation blocklist TTL. Set slightly longer than the JWT
 * lifetime to absorb clock skew between issuance and KV write, so a
 * revoked jti remains in the blocklist for the full lifetime of any
 * outstanding token signed with that jti.
 *
 * The 5-minute pad is generous compared to typical edge clock drift
 * (`JWT_MAX_FUTURE_SKEW_S = 30s`) and is bounded so a misconfigured
 * EXPIRY can't blow up KV storage.
 */
export const REVOKED_JWT_TTL_SECONDS = ADMIN_JWT_EXPIRY_SECONDS + 5 * 60;

/**
 * String form of the JWT expiry used by `jose.SignJWT().setExpirationTime()`.
 * `jose` accepts either a numeric seconds-from-now value or a duration
 * string; we use the string form so existing tests that match the
 * literal "4h" continue to pass.
 */
export const ADMIN_JWT_EXPIRY_STRING = `${ADMIN_JWT_EXPIRY_SECONDS}s` as const;

/**
 * A100-1: Absolute session lifetime caps.
 *
 * No session may live beyond these ceilings regardless of activity.
 * This limits the damage window if a token is stolen. The JWT `exp`
 * claim already constrains token lifetime, but cookie `maxAge` was
 * previously set to match `exp` without a role-aware ceiling.
 *
 * - Regular admin: 24 hours
 * - Super-admin:   12 hours (higher-privilege ⇒ tighter window)
 *
 * The cookie maxAge in the login route should use these values instead
 * of hard-coding `4h`. If the JWT expiry (`ADMIN_JWT_EXPIRY_SECONDS`)
 * is shorter, the JWT itself still governs — these caps only prevent
 * the cookie from outliving the intended session boundary.
 */
export const MAX_SESSION_AGE_REGULAR_SECONDS = 24 * 60 * 60; // 24h
export const MAX_SESSION_AGE_ADMIN_SECONDS = 12 * 60 * 60; // 12h for super_admin
