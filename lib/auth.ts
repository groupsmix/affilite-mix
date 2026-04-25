import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { verifyPassword, hashPassword } from "@/lib/password";
import { logger } from "@/lib/logger";
import { getJwtSecret } from "@/lib/jwt-secret";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { computeRequestBinding, verifyRequestBinding } from "@/lib/jwt-binding";
import { isTokenRevoked } from "@/lib/jwt-revocation";

const COOKIE_NAME = "nh_admin_token";
/** Cookie tracking last admin activity for idle-timeout enforcement */
const ACTIVITY_COOKIE = "nh_admin_activity";
/** Admin sessions expire after 30 minutes of inactivity */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const EXPIRY = "8h"; // F-005: Reduced from 24h to limit exposure

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
 */
const DUMMY_PASSWORD_HASH = "$2b$12$TeQV2VccuCYpmsfgIaWx1eQsGCyowOfMyZClxCXbjNAjhUaQMwcBm";

function getSecretKey() {
  return new TextEncoder().encode(getJwtSecret());
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
  const hashToCheck = user?.password_hash ?? DUMMY_PASSWORD_HASH;

  const { valid, needsRehash } = await verifyPassword(password, hashToCheck);

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
  const binding = request ? await computeRequestBinding(request) : null;
  const claims: AdminPayload = { ...payload };
  if (binding) claims.bnd = binding;

  const jti = crypto.randomUUID();

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
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
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      audience: "affilite-mix-admin",
      issuer: "affilite-mix-auth",
    });

    if (payload.jti && (await isTokenRevoked(payload.jti))) {
      logger.warn("Token rejected: explicitly revoked", { jti: payload.jti });
      return null;
    }

    const adminPayload = payload as unknown as AdminPayload;

    if (adminPayload.bnd) {
      const ok = await verifyRequestBinding(adminPayload.bnd, request);
      if (!ok) {
        logger.warn("Admin token rejected: UA/IP binding mismatch", {
          userId: adminPayload.userId,
        });
        return null;
      }
    }

    return adminPayload;
  } catch {
    return null;
  }
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

  // Check idle timeout — if the user hasn't performed an action in the
  // last IDLE_TIMEOUT_MS we treat the session as expired.
  const lastActivity = cookieStore.get(ACTIVITY_COOKIE)?.value;
  if (lastActivity) {
    const elapsed = Date.now() - Number(lastActivity);
    if (elapsed > IDLE_TIMEOUT_MS) return null;
  }

  // F-035: verify the token's UA/IP binding (if present) against the
  // current request. A mismatch = possible session hijack → reject.
  const req = await requestFromHeaders();
  return verifyToken(token, req);
}

/**
 * Touch the admin activity timestamp.
 * Call this in admin API routes so the idle-timeout cookie stays fresh.
 */
export function touchAdminActivity(): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  return {
    name: ACTIVITY_COOKIE,
    value: String(Date.now()),
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

/** Cookie name for admin auth */
export { COOKIE_NAME, ACTIVITY_COOKIE };
