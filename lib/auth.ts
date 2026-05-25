import { SignJWT, jwtVerify, errors as joseErrors } from "jose";
import { cookies, headers } from "next/headers";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { verifyPassword, hashPassword } from "@/lib/password";
import { logger } from "@/lib/logger";
import { getJwtSecret, getJwtSecretPrevious, getJwtKid } from "@/lib/jwt-secret";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { computeRequestBinding, verifyRequestBinding } from "@/lib/jwt-binding";
import { isTokenRevoked } from "@/lib/jwt-revocation";
import { timingSafeEqual } from "@/lib/internal-hmac";
// A6-03: use purpose-derived HMAC sub-key instead of the raw JWT secret
import { deriveHmacKey } from "@/lib/hmac-key";

const COOKIE_NAME = "nh_admin_token";
/** Cookie tracking last admin activity for idle-timeout enforcement */
const ACTIVITY_COOKIE = "nh_admin_activity";
/** A-012: Separate HttpOnly cookie storing the UA/IP binding fingerprint.
 *  Even if the JWT is exfiltrated (e.g. via XSS), an attacker without
 *  this cookie cannot replay the session from a different device. */
const BINDING_COOKIE = "nh_admin_binding";
/** Admin sessions expire after 30 minutes of inactivity */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const EXPIRY = "4h"; // F-SEC-03: Reduced from 8h to limit exposure

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
  // Import bcrypt at runtime to read the configured cost factor
  const rounds = process.env.BCRYPT_ROUNDS ? parseInt(process.env.BCRYPT_ROUNDS, 10) : 10;
  if (!Number.isFinite(rounds) || rounds < 4 || rounds > 31) {
    // Defensive: invalid cost → fall back to the known-safe default
    return "$2b$10$";
  }
  // bcrypt encodes cost as a zero-padded 2-digit decimal between $2b$ and $
  return `$2b$${String(rounds).padStart(2, "0")}$`;
}

// A6-006: Hash suffix — a known-random fragment that is never a valid password.
// The full hash is only used for timing equalization; verification always fails.
const DUMMY_HASH_SUFFIX = "FIQMYsgSk2SAqMvHOeYvCeFGj1FfTGeQC3aghyI97o73Xda0uV4x2";

/** A6-006: Lazily assembled dummy hash so the cost factor always matches BCRYPT_ROUNDS. */
function getDummyPasswordHash(): string {
  return `${buildDummyHashPrefix()}${DUMMY_HASH_SUFFIX}`;
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
    out += view[i].toString(16).padStart(2, "0");
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

export interface AdminPayload {
  email?: string;
  userId?: string;
  role: "admin" | "super_admin";
  /**
   * F-035: optional user-agent + IP fingerprint bound at token issuance.
   * Present on tokens minted from a login request; verified on every read
   * so a token replayed from a different device/network is rejected.
   */
  bnd?: string;
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
  const user = email ? await getAdminUserByEmail(email) : null;
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
      await updateAdminUser(user.id, { password_hash: newHash });
      logger.info("Rehashed password from PBKDF2 to bcrypt", { userId: user.id });
    } catch {
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

  if (payload.jti && (await isTokenRevoked(payload.jti as string))) {
    logger.warn("Token rejected: explicitly revoked", { jti: payload.jti });
    return null;
  }

  const adminPayload = payload as unknown as AdminPayload;

  // P0-1: In production, require the bnd claim on all tokens. Legacy/unbound
  // tokens are rejected so a stolen JWT without binding cannot be replayed.
  // In dev/test, binding is still optional for convenience.
  const requireBinding = process.env.NODE_ENV === "production";

  if (adminPayload.bnd) {
    // G-16: pass role so super_admin verification uses /32 binding
    const ok = await verifyRequestBinding(
      adminPayload.bnd,
      request,
      requireBinding,
      adminPayload.role,
    );
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
    return undefined;
  }
}

/** Read admin session from cookies (server-side) */
export async function getAdminSession(): Promise<AdminPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  // G-15 / P1-8: Server-side idle timeout — the activity cookie is HMAC-signed
  // so clients cannot forge timestamps to extend their session.
  // In production, a missing activity cookie is treated as expired (not as
  // "no idle check") to prevent degradation to pure JWT-lifetime auth.
  const lastActivity = cookieStore.get(ACTIVITY_COOKIE)?.value;
  if (lastActivity) {
    const ts = await verifySignedTimestamp(lastActivity);
    if (ts === null) {
      logger.warn("Admin session rejected: activity cookie signature invalid (possible tampering)");
      return null;
    }
    const elapsed = Date.now() - ts;
    if (elapsed > IDLE_TIMEOUT_MS) return null;
  } else if (process.env.NODE_ENV === "production") {
    // P1-8: Missing activity cookie in production — treat as expired.
    // This prevents sessions from degrading to JWT-lifetime-only auth
    // when the activity cookie is stripped or never set (legacy tokens).
    logger.warn("Admin session rejected: missing activity cookie in production");
    return null;
  }

  // F-035: verify the token's UA/IP binding (if present) against the
  // current request. A mismatch = possible session hijack → reject.
  const req = await requestFromHeaders();
  const payload = await verifyToken(token, req);
  if (!payload) return null;

  // A-012: verify the separate binding cookie matches the JWT bnd claim.
  // This ensures an attacker who only steals the JWT (not the HttpOnly
  // binding cookie) cannot replay the session.
  if (payload.bnd) {
    const bindingCookie = cookieStore.get(BINDING_COOKIE)?.value;
    // A-05: constant-time comparison to prevent timing oracle on binding cookie
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
      maxAge: 60 * 60 * 4, // 4 hours (matches JWT EXPIRY — F-SEC-03)
    },
  };
}

/** Cookie name for admin auth */
export { COOKIE_NAME, ACTIVITY_COOKIE, BINDING_COOKIE };
