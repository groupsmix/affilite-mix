import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { cookies, headers } from "next/headers";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { verifyPassword, hashPassword, BCRYPT_ROUNDS } from "@/lib/password";
import { logger } from "@/lib/logger";
import { getJwtSecret, getJwtSecretPrevious, getJwtKid } from "@/lib/jwt-secret";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { computeRequestBinding, verifyRequestBinding } from "@/lib/jwt-binding";
import { isTokenRevoked, getUserSessionInvalidBefore } from "@/lib/jwt-revocation";
// RISK-05 (étap-3): In-memory revocation check for immediate effect
import { isTokenRevokedImmediate } from "@/lib/jwt-revocation-strong";
import { timingSafeEqual } from "@/lib/internal-hmac";
// A6-03: use purpose-derived HMAC sub-key instead of the raw JWT secret
import { deriveHmacKey } from "@/lib/hmac-key";
// SEC-02 (etap-3): canonical boolean env-var parser — accepts "1"/"true"/"yes"/"on"
import { parseBoolEnv, parseTriBoolEnv } from "@/lib/env-bool";
import {
  ADMIN_JWT_EXPIRY_SECONDS,
  ADMIN_JWT_EXPIRY_STRING,
  MAX_SESSION_AGE_REGULAR_SECONDS,
  MAX_SESSION_AGE_ADMIN_SECONDS,
} from "@/lib/auth-constants";

// A7-012: Use __Host- prefix in production (Secure context) to prevent
// Domain attribute injection and scope cookies to the exact origin.
// In development (HTTP), the standard names are used since __Host-
// cookies require the Secure flag which is HTTPS-only.
const COOKIE_PREFIX = IS_SECURE_COOKIE ? "__Host-" : "";
const COOKIE_NAME = `${COOKIE_PREFIX}nh_admin_token`;
/** Cookie tracking last admin activity for idle-timeout enforcement */
const ACTIVITY_COOKIE = `${COOKIE_PREFIX}nh_admin_activity`;
/** A-012: Separate HttpOnly cookie storing the UA/IP binding fingerprint.
 *  Even if the JWT is exfiltrated (e.g. via XSS), an attacker without
 *  this cookie cannot replay the session from a different device. */
const BINDING_COOKIE = `${COOKIE_PREFIX}nh_admin_binding`;
/**
 * Admin sessions expire after 30 minutes of inactivity.
 *
 * S0-A3-004: the env var override is clamped to [5, 60] minutes so a
 * misconfiguration cannot set an absurdly long (or zero) idle timeout.
 */
const IDLE_TIMEOUT_MINS = (() => {
  const envVal = Number(process.env.ADMIN_ACTIVITY_TIMEOUT_MINS);
  if (!Number.isFinite(envVal) || envVal <= 0) return 30;
  return Math.max(5, Math.min(60, envVal));
})();
const IDLE_TIMEOUT_MS = IDLE_TIMEOUT_MINS * 60 * 1000;
// F-SEC-03: Reduced from 8h to limit exposure. Sourced from
// `lib/auth-constants.ts` so the JWT lifetime, the KV revocation TTL,
// and the admin cookie maxAge all derive from one value.
const EXPIRY = ADMIN_JWT_EXPIRY_STRING;

/** A28-005: Maximum acceptable JWT issue-time future skew (30 seconds).
 * Tokens issued more than this far in the future are rejected,
 * protecting against wrong-edge-clock scenarios. */
const JWT_MAX_FUTURE_SKEW_S = 30;

/**
 * Dummy bcrypt hash used to equalize timing between known and unknown users.
 *
 * When an admin email is missing or not found in the database we still run
 * `verifyPassword` against this fixed hash so an attacker cannot distinguish
 * "user does not exist" from "user exists, wrong password" via response time.
 *
 * This is a bcrypt hash of a random string that is never used as a real
 * password; it exists purely to produce a bcrypt-verification workload of
 * the same order of magnitude as a normal login.
 *
 * A6-006: The cost factor is injected at build time from the same source as
 * lib/password.ts (BCRYPT_ROUNDS = 10). If the two values drift, timing
 * differences reappear. We generate the hash prefix dynamically so the cost
 * always matches.
 */
function buildDummyHashPrefix(): string {
  // P0-5: Reuse the exact cost factor from lib/password.ts so timing
  // equalization cannot drift from the live bcrypt workload.
  return `$2b$${String(BCRYPT_ROUNDS).padStart(2, "0")}$`;
}

// A6-006: Hash suffix — a known-random fragment that is never a valid password.
// The full hash is only used for timing equalization; verification always fails.
const DUMMY_HASH_SUFFIX = "FIQMYsgSk2SAqMvHOeYvCeFGj1FfTGeQC3aghyI97o73Xda0uV4x2";

/** A6-006: Lazily assembled dummy hash so the cost factor always matches BCRYPT_ROUNDS. */
function getDummyPasswordHash(): string {
  return `${buildDummyHashPrefix()}${DUMMY_HASH_SUFFIX}`;
}

// ---------------------------------------------------------------------------
// SEC-CRIT-04: Per-control strict-mode flags
// ---------------------------------------------------------------------------

/**
 * SEC-CRIT-04 (deep-audit): Read an individual admin-session hardening flag.
 *
 * Each control (token revocation, UA/IP binding, idle timeout) has its own
 * env var so a single typo on the umbrella `ADMIN_SESSION_STRICT` cannot
 * silently disable three independent defences. The umbrella flag still works
 * — when `ADMIN_SESSION_STRICT=true`, every individual flag is treated as on
 * unless explicitly set to `false`. This preserves backward compatibility
 * with existing deploys / wrangler configs while letting operators disable a
 * single control during a genuine incident (e.g. KV outage → temporarily
 * unset `ADMIN_SESSION_TOKEN_REVOCATION_STRICT` without weakening binding
 * enforcement).
 *
 * The recognised individual flags are:
 *   - ADMIN_SESSION_TOKEN_REVOCATION_STRICT
 *   - ADMIN_SESSION_BINDING_STRICT
 *   - ADMIN_SESSION_IDLE_STRICT
 */
function isAdminControlEnabled(name: string): boolean {
  // SEC-02 (etap-3): use the canonical env-bool parser so an operator who
  // sets `ADMIN_SESSION_STRICT=1` (mirroring APP_MAINTENANCE_MODE=1) does
  // not silently disable three independent defences. Tri-bool returns
  // null when the individual flag is unset/empty, in which case the
  // umbrella default applies.
  const own = parseTriBoolEnv(name);
  if (own !== null) return own;
  return parseBoolEnv("ADMIN_SESSION_STRICT", false);
}

// ---------------------------------------------------------------------------
// G-15: HMAC-signed activity timestamps
// ---------------------------------------------------------------------------

const HMAC_ENCODER = new TextEncoder();

/** Derive a purpose-specific HMAC key for activity-cookie signing (A6-03). */
async function getActivityHmacKey(): Promise<CryptoKey> {
  return deriveHmacKey("activity-cookie", ["sign", "verify"]);
}

function bytesToHex(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < view.length; i++) {
    out += view[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

/** Constant-time string comparison for hex MAC values of equal length. */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Sign a timestamp with HMAC-SHA256 using the JWT secret as key. */
async function signTimestamp(ts: number): Promise<string> {
  const key = await getActivityHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, HMAC_ENCODER.encode(`activity:${ts}`));
  return `${ts}.${bytesToHex(sig)}`;
}

/** Verify a signed timestamp. Returns the timestamp or null if invalid.
 *
 * P1-8: In production, legacy unsigned cookies (no dot separator) are
 * rejected outright. Accepting them previously meant an attacker could
 * forge an activity timestamp by writing a plain numeric cookie value.
 */
async function verifySignedTimestamp(value: string): Promise<number | null> {
  const dot = value.indexOf(".");
  if (dot === -1) {
    // P1-8: Legacy unsigned cookie — reject in production so forged
    // timestamps cannot extend sessions.
    if (process.env.NODE_ENV === "production") {
      logger.warn("Activity cookie rejected: unsigned legacy format in production");
      return null;
    }
    // Dev/test: accept plain timestamps for convenience
    const ts = Number(value);
    return Number.isFinite(ts) ? ts : null;
  }
  const ts = Number(value.slice(0, dot));
  if (!Number.isFinite(ts)) return null;

  // P1-8: Reject future timestamps (clock skew > 60s is suspicious)
  if (ts > Date.now() + 60_000) {
    logger.warn("Activity cookie rejected: timestamp is in the future", { ts });
    return null;
  }

  const expected = await signTimestamp(ts);
  if (!constantTimeEqual(expected, value)) return null;
  return ts;
}

function getSecretKey() {
  return new TextEncoder().encode(getJwtSecret());
}

/** F-AUTH-03: Returns the previous secret key for rotation grace window, or null. */
function getPreviousSecretKey(): Uint8Array | null {
  const prev = getJwtSecretPrevious();
  return prev ? new TextEncoder().encode(prev) : null;
}

function decodeBase64UrlUtf8(segment: string): string | null {
  try {
    const padded = segment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

function getUnverifiedTokenIat(token: string): number | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const payloadJson = decodeBase64UrlUtf8(segments[1]!);
  if (!payloadJson) return null;

  try {
    const payload = JSON.parse(payloadJson) as { iat?: unknown };
    return typeof payload.iat === "number" ? payload.iat : null;
  } catch {
    return null;
  }
}

export interface AdminPayload {
  email?: string;
  userId?: string;
  role: "admin" | "super_admin";
  /** M6-03: tenant scope. Present on tokens minted per-site; verified to match the resolved tenant. */
  site_id?: string;
  /**
   * F-035: optional user-agent + IP fingerprint bound at token issuance.
   * Present on tokens minted from a login request; verified on every read
   * so a token replayed from a different device/network is rejected.
   */
  bnd?: string;
  /**
   * A100-1 / A98-8: Unix epoch (seconds) of the original login.
   * Carried forward on token refresh so absolute session lifetime can
   * be enforced regardless of how many times the token is refreshed.
   */
  session_start?: number;
  /**
   * F-030 (step-up): Unix epoch in **milliseconds** of the most recent
   * password/TOTP re-verification. Minted at login (after 2FA when enabled) and
   * refreshed by `POST /api/auth/step-up`. `createToken` carries it forward
   * unchanged on token refresh, so the step-up window expires relative to the
   * verification itself — a background refresh does NOT renew it. Read by
   * `requireStepUpAuth` to gate destructive operations.
   *
   * Note: milliseconds, unlike `session_start` (seconds), because
   * `requireStepUpAuth` compares it against `Date.now()` directly.
   */
  step_up_at?: number;
  /**
   * FIX: JWT ID carried through to AdminPayload so callers (e.g. refresh
   * route) can revoke the old token without re-reading/re-decoding the
   * cookie. The JTI is always set at createToken() via .setJti(); expose
   * it here so TypeScript callers can access it without unsafe casts.
   */
  jti?: string;
}

/**
 * Authenticate a user via per-user DB accounts.
 * Requires both email and password.
 */
export async function authenticateUser(
  email: string | undefined,
  password: string,
): Promise<AdminPayload | null> {
  // Timing-equalization: run password verification against a dummy hash when
  // the email is missing or the user is not found, so the total time spent
  // hashing does not leak whether an account exists for the given email.
  const user = email
    ? await getAdminUserByEmail(email, () => getPrivilegedSupabaseClient("authenticateUser"))
    : null;
  const hashToCheck = user?.password_hash ?? getDummyPasswordHash();

  const { valid, needsRehash } = await verifyPassword(password, hashToCheck);

  // SECURITY: Both conditions MUST remain here. Removing `!user` would turn
  // DUMMY_PASSWORD_HASH into a universal backdoor — any unknown email combined
  // with the dummy hash's plaintext would authenticate successfully.
  // See audit finding A2-01 / CWE-798.
  if (!user || !valid) return null;

  // Transparent rehash: upgrade legacy PBKDF2 hashes to bcrypt on successful login
  if (needsRehash) {
    try {
      const newHash = await hashPassword(password);
      await updateAdminUser(user.id, { password_hash: newHash }, () =>
        getPrivilegedSupabaseClient("authenticateUser:rehash"),
      );
      logger.info("Rehashed password from PBKDF2 to bcrypt", { userId: user.id });
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Rehash failure is non-critical — the user is already authenticated
      logger.warn("Failed to rehash password on login", { userId: user.id });
    }
  }

  return {
    email: user.email,
    userId: user.id,
    role: user.role,
  };
}

/**
 * Create a signed JWT for admin session.
 *
 * When `request` is provided, a short fingerprint of the requesting client's
 * user-agent and IP /24 is embedded as the `bnd` claim (F-035). Subsequent
 * verifications that supply a request will reject replays from a different
 * client. Callers without a request context (e.g. background jobs) can omit
 * the parameter and a plain token is issued.
 */
export async function createToken(payload: AdminPayload, request?: Request): Promise<string> {
  // G-16: pass role so super_admin gets /32 binding (stricter than /24)
  const binding = request ? await computeRequestBinding(request, payload.role) : null;

  // F-AUTH-02: In production, when a request is provided (login context), fail
  // issuance if binding cannot be computed. In dev/test environments, binding is
  // best-effort since Cloudflare headers (cf-connecting-ip) are unavailable.
  if (request && !binding && process.env.NODE_ENV === "production") {
    throw new Error(
      "Cannot issue admin token: unable to compute request binding (no UA + unknown IP)",
    );
  }

  const claims: AdminPayload = { ...payload };
  if (typeof claims.session_start !== "number") {
    claims.session_start = Math.floor(Date.now() / 1000);
  }
  if (binding) claims.bnd = binding;

  const jti = crypto.randomUUID();

  const kid = await getJwtKid();

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256", kid })
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .setAudience("affilite-mix-admin")
    .setIssuer("affilite-mix-auth")
    .sign(getSecretKey());
}

/**
 * LIB-HIGH-1: Validate that a decoded JWT payload carries every claim needed
 * to establish a trusted admin session.
 *
 * `jwtVerify` cryptographically proves the token was signed with our key and
 * that the `aud`/`iss`/`exp` claims are valid, but it does NOT enforce the
 * presence of the application-level admin claims (`userId`, `role`). The rest
 * of `verifyToken` casts the decoded payload to `AdminPayload` and trusts
 * `role` for authorization (assertRole / requireSuperAdmin) and `userId` for
 * audit logging and per-user session floors. A token whose payload omits
 * those fields — e.g. one minted by a buggy future code path, or a token
 * forged after a key compromise that only knew to set `sub`/`exp` — would
 * otherwise authenticate with `role`/`userId` = undefined and could bypass
 * role requirements (a missing role never equals "super_admin", so it fails
 * closed for super_admin checks, but a *forged* role string is the real risk).
 *
 * Defence-in-depth: also re-check `aud` even though jose enforces it, so a
 * future refactor that drops the `audience` option cannot silently widen the
 * accepted token set.
 */
function isValidAdminPayload(payload: Record<string, unknown>): boolean {
  // userId: must be a non-empty string. Every real admin session carries it
  // (authenticateUser sets it from the DB row).
  if (typeof payload.userId !== "string" || payload.userId.length === 0) return false;
  // role: must be exactly one of the two known admin roles. Anything else
  // (missing, a number, a foreign role string) is a forged/corrupt payload.
  if (payload.role !== "admin" && payload.role !== "super_admin") return false;
  // aud: jose already verified it equals "affilite-mix-admin"; re-check here
  // as belt-and-braces against a future config regression.
  if (payload.aud !== "affilite-mix-admin") return false;
  return true;
}

/**
 * Verify and decode the admin JWT.
 *
 * If `request` is supplied and the token carries a `bnd` claim (F-035), the
 * claim is matched against the current request's user-agent + IP /24. A
 * mismatch returns null so the session is treated as invalid.
 */
export async function verifyToken(token: string, request?: Request): Promise<AdminPayload | null> {
  // SECURITY-FIX: Specify allowed algorithms to prevent algorithm confusion (JWT-001 / CWE-347)
  const jwtOpts = {
    audience: "affilite-mix-admin",
    issuer: "affilite-mix-auth",
    algorithms: ["HS256"] as string[],
  };

  // P0-6 / SEC-04: Reject obviously future-dated tokens before any
  // signature verification, including the previous-key rotation path.
  const unverifiedIat = getUnverifiedTokenIat(token);
  if (typeof unverifiedIat === "number") {
    const nowSec = Math.floor(Date.now() / 1000);
    const futureSkew = unverifiedIat - nowSec;
    if (futureSkew > JWT_MAX_FUTURE_SKEW_S) {
      logger.warn("JWT rejected: issued-at too far in the future (clock skew?)", {
        futureSkewSec: futureSkew,
        iat: unverifiedIat,
        nowSec,
      });
      return null;
    }
  }

  let payload: Record<string, unknown> | null = null;

  // F-AUTH-03: Try the current key first, then fall back to the previous key
  // during rotation grace window. Only fall back for JOSE-specific errors
  // (signature mismatch, expired, etc.); unexpected errors should propagate.
  try {
    const result = await jwtVerify(token, getSecretKey(), jwtOpts);
    payload = result.payload as Record<string, unknown>;
  } catch (err) {
    if (!(err instanceof joseErrors.JOSEError)) throw err;
    const prevKey = getPreviousSecretKey();
    if (prevKey) {
      try {
        const result = await jwtVerify(token, prevKey, jwtOpts);
        payload = result.payload as Record<string, unknown>;
      } catch (prevErr) {
        if (!(prevErr instanceof joseErrors.JOSEError)) throw prevErr;
        return null;
      }
    } else {
      return null;
    }
  }

  if (!payload) return null;

  // LIB-HIGH-1: Explicit presence/shape validation for every role-bearing
  // claim BEFORE the payload is trusted. `jwtVerify` already guarantees the
  // `aud` matches "affilite-mix-admin", but the rest of the payload is the
  // raw decoded JSON — a token minted with a crafted payload (e.g. a leaked
  // signing key, or a future code path that constructs a token without the
  // required fields) could otherwise carry a missing/garbage `role`/`userId`
  // and still authenticate. Reject it up front so the cast at the end of this
  // function can never produce an AdminPayload that downstream role checks
  // (assertRole, requireSuperAdmin) would mis-trust.
  if (!isValidAdminPayload(payload)) {
    logger.warn("Admin token rejected: payload missing required admin claims", {
      hasUserId: typeof payload.userId === "string" && payload.userId.length > 0,
      hasRole: typeof payload.role === "string",
      aud: payload.aud,
    });
    return null;
  }

  // A100-1 / A98-8: Absolute session lifetime enforcement.
  // Prevents indefinite sessions via repeated refresh. The `session_start`
  // claim is set at login and carried forward on every refresh. Even if the
  // JWT itself hasn't expired (4h window), the session is rejected once the
  // absolute ceiling is reached.
  const sessionStart = typeof payload.session_start === "number" ? payload.session_start : null;
  if (sessionStart !== null) {
    const nowSec = Math.floor(Date.now() / 1000);
    const role = (payload.role as string) ?? "admin";
    const maxAge =
      role === "super_admin" ? MAX_SESSION_AGE_ADMIN_SECONDS : MAX_SESSION_AGE_REGULAR_SECONDS;
    const elapsed = nowSec - sessionStart;
    if (elapsed > maxAge) {
      logger.warn("Admin token rejected: absolute session lifetime exceeded", {
        sessionStart,
        elapsedSec: elapsed,
        maxAgeSec: maxAge,
        role,
      });
      return null;
    }
  }

  // SEC-CRIT-04 (deep-audit): each hardening control reads its own flag with
  // ADMIN_SESSION_STRICT as the umbrella default. A single typo on
  // ADMIN_SESSION_STRICT no longer disables three independent defences;
  // operators can still individually toggle a control if one infra dependency
  // (e.g. KV availability for revocation) is genuinely unhealthy.
  //
  // SEC-FIX: Revocation is now DEFAULT-ON. The previous `isAdminControlEnabled`
  // call defaulted to false when ADMIN_SESSION_STRICT was unset, meaning
  // revokeToken() at logout/password-change had zero effect in default deploys.
  // SEC-FIX tri-state: ADMIN_SESSION_TOKEN_REVOCATION_STRICT controls revocation:
  //   unset  → revocation CHECKED, fail-OPEN on KV outage (safe default; closes
  //            the logout/password-reset gap without risking a lockout DoS).
  //   "true" → revocation CHECKED, fail-CLOSED on KV outage (strict — a leaked
  //            token cannot be replayed even during a KV outage).
  //   "false"→ revocation NOT checked (emergency escape hatch).
  const revocationFlag = parseTriBoolEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT");
  const revocationChecked = revocationFlag !== false;
  const revocationFailClosed = revocationFlag === true;
  if (revocationChecked && payload.jti) {
    // RISK-05 (étap-3): Check in-memory blocklist first for immediate effect
    // (covers same-isolate revocation within milliseconds), then fall back to
    // KV for cross-isolate propagation (~60s eventual consistency).
    if (
      isTokenRevokedImmediate(payload.jti as string) ||
      (await isTokenRevoked(payload.jti as string, { failClosed: revocationFailClosed }))
    ) {
      logger.warn("Token rejected: explicitly revoked", { jti: payload.jti });
      return null;
    }
  }

  // SEC-FIX (High-5): Per-user session floor. A password reset sets a cutoff so
  // EVERY token issued before it is rejected — covering other devices and the
  // email-link reset path (which has no cookie jti to revoke). Shares the same
  // default-on control as jti revocation. getUserSessionInvalidBefore fails open
  // (returns null) on KV outage, so this never causes a lockout.
  if (revocationChecked) {
    const uid = typeof payload.userId === "string" ? payload.userId : null;
    const tokenStart =
      typeof payload.session_start === "number"
        ? payload.session_start
        : typeof payload.iat === "number"
          ? payload.iat
          : null;
    if (uid && tokenStart !== null) {
      const invalidBefore = await getUserSessionInvalidBefore(uid);
      if (invalidBefore !== null && tokenStart < invalidBefore) {
        logger.warn("Token rejected: user sessions invalidated (password reset / forced logout)", {
          userId: uid,
        });
        return null;
      }
    }
  }

  const adminPayload = payload as unknown as AdminPayload;
  // FIX: Copy jti from the raw JWT payload to AdminPayload so callers
  // (e.g. the refresh route) can revoke the old token without unsafe casts.
  if (typeof payload.jti === "string" && !adminPayload.jti) {
    adminPayload.jti = payload.jti as string;
  }

  // P0-1 / SEC-CRIT-04 / SEC-05 (etap-3): Binding enforcement gated independently.
  //
  // SEC-05: If a token was MINTED with a `bnd` claim, always verify it,
  // regardless of the operator-toggle. The flag only controls whether a
  // token MISSING `bnd` is acceptable (e.g. legacy or background-job tokens).
  // Earlier revisions skipped binding verification entirely when the flag
  // was off, which silently disabled hijack detection for the very tokens
  // that opted into it.
  const requireBinding = isAdminControlEnabled("ADMIN_SESSION_BINDING_STRICT");

  if (adminPayload.bnd) {
    // G-16: pass role so super_admin verification uses /32 binding.
    // Pass `true` for strict here — a present `bnd` is always enforced.
    const ok = await verifyRequestBinding(adminPayload.bnd, request, true, adminPayload.role);
    if (!ok) {
      logger.warn("Admin token rejected: UA/IP binding mismatch", {
        userId: adminPayload.userId,
      });
      return null;
    }
  } else if (requireBinding) {
    logger.warn("Admin token rejected: missing bnd claim in production", {
      userId: adminPayload.userId,
    });
    return null;
  }

  return adminPayload;
}

/** Build a lightweight Request wrapper from the current Next.js headers() */
async function requestFromHeaders(): Promise<Request | undefined> {
  try {
    const headerList = await headers();
    return new Request("https://internal/admin-session", { headers: headerList });
  } catch {
    // D10-02: returns undefined → binding check is skipped (fail-safe for the
    // main auth flow; defence-in-depth binding simply becomes unavailable)
    return undefined;
  }
}

/** Read admin session from cookies (server-side) */
export async function getAdminSession(): Promise<AdminPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  // SEC-CRIT-04: Each defence reads its own flag. ADMIN_SESSION_STRICT (legacy
  // umbrella) still implies all three; individual flags allow precise toggling.
  const idleStrict = isAdminControlEnabled("ADMIN_SESSION_IDLE_STRICT");
  const bindingStrict = isAdminControlEnabled("ADMIN_SESSION_BINDING_STRICT");

  // G-15 / P1-8 / SEC-CRIT-04: Server-side idle timeout — the activity cookie
  // is HMAC-signed so clients cannot forge timestamps. Even outside strict
  // mode, a signature failure means tampering (or key rotation); we never
  // accept a tampered activity cookie regardless of strict-mode flags.
  const lastActivity = cookieStore.get(ACTIVITY_COOKIE)?.value;
  if (lastActivity) {
    const ts = await verifySignedTimestamp(lastActivity);
    if (ts === null) {
      logger.warn(
        "Admin session rejected: activity cookie signature invalid (tampering or stale key)",
      );
      return null;
    }
    const elapsed = Date.now() - ts;
    if (elapsed > IDLE_TIMEOUT_MS) {
      if (idleStrict) return null;
      logger.warn("Admin session: idle timeout exceeded (non-strict mode, allowing)");
    }
  } else if (idleStrict) {
    logger.warn("Admin session rejected: missing activity cookie in production");
    return null;
  }

  // F-035: verify the token's UA/IP binding (if present) against the
  // current request. A mismatch = possible session hijack → reject.
  // S1-A7-01: fail-closed when binding is strict and headers are unavailable.
  const req = await requestFromHeaders();
  if (!req && bindingStrict) {
    logger.warn(
      "Admin session rejected: unable to read request headers for binding check (strict mode)",
    );
    return null;
  }
  const payload = await verifyToken(token, req);
  if (!payload) return null;

  // A-012: verify the separate binding cookie matches the JWT bnd claim.
  if (bindingStrict && payload.bnd) {
    const bindingCookie = cookieStore.get(BINDING_COOKIE)?.value;
    if (!timingSafeEqual(bindingCookie ?? "", payload.bnd as string)) {
      logger.warn("Admin session rejected: binding cookie mismatch (possible token replay)", {
        userId: payload.userId,
      });
      return null;
    }
  }

  return payload;
}

/**
 * Touch the admin activity timestamp.
 * Call this in admin API routes so the idle-timeout cookie stays fresh.
 */
export async function touchAdminActivity(): Promise<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> {
  return {
    name: ACTIVITY_COOKIE,
    // G-15: HMAC-signed timestamp prevents client-side forgery
    value: await signTimestamp(Date.now()),
    options: {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict" as const,
      path: "/",
      // F-042: Align maxAge with the idle timeout so the browser drops it naturally
      maxAge: Math.floor(IDLE_TIMEOUT_MS / 1000),
    },
  };
}

/**
 * Build the binding cookie to set alongside the admin JWT.
 * Callers (e.g. login route) should set this cookie with the same
 * policy as the main auth token.
 */
export function getAdminBindingCookie(binding: string): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  return {
    name: BINDING_COOKIE,
    value: binding,
    options: {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict" as const,
      path: "/",
      maxAge: ADMIN_JWT_EXPIRY_SECONDS, // matches JWT EXPIRY — F-SEC-03
    },
  };
}

/** Cookie name for admin auth */
export { COOKIE_NAME, ACTIVITY_COOKIE, BINDING_COOKIE };
