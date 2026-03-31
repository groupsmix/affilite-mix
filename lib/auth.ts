import { randomUUID } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAdminUserByEmail, updateAdminUser } from "@/lib/dal/admin-users";
import { verifyPassword, hashPassword } from "@/lib/password";
import { logger } from "@/lib/logger";
import { requireEnvInProduction } from "@/lib/env";

const devFallback = randomUUID() + randomUUID();
const JWT_SECRET = requireEnvInProduction("JWT_SECRET", devFallback);
if (JWT_SECRET === devFallback) {
  console.warn("JWT_SECRET not set — using random dev fallback (sessions will not persist across restarts)");
}
const COOKIE_NAME = "nh_admin_token";
/** Cookie tracking last admin activity for idle-timeout enforcement */
const ACTIVITY_COOKIE = "nh_admin_activity";
/** Admin sessions expire after 30 minutes of inactivity */
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const EXPIRY = "24h";

function getSecretKey() {
  return new TextEncoder().encode(JWT_SECRET);
}

export interface AdminPayload {
  email?: string;
  userId?: string;
  role: "admin" | "super_admin";
}

/**
 * Authenticate a user via per-user DB accounts.
 * Requires both email and password.
 */
export async function authenticateUser(
  email: string | undefined,
  password: string,
): Promise<AdminPayload | null> {
  if (!email) return null;

  const user = await getAdminUserByEmail(email);
  if (!user) return null;

  const { valid, needsRehash } = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

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

/** Create a signed JWT for admin session */
export async function createToken(payload: AdminPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .setAudience("affiliate-platform")
    .setIssuer("affiliate-platform")
    .sign(getSecretKey());
}

/** Verify and decode the admin JWT */
export async function verifyToken(
  token: string,
): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      audience: "affiliate-platform",
      issuer: "affiliate-platform",
    });
    return payload as unknown as AdminPayload;
  } catch {
    return null;
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

  return verifyToken(token);
}

/**
 * Touch the admin activity timestamp.
 * Call this in admin API routes so the idle-timeout cookie stays fresh.
 */
export function touchAdminActivity(): { name: string; value: string; options: Record<string, unknown> } {
  return {
    name: ACTIVITY_COOKIE,
    value: String(Date.now()),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      path: "/",
      maxAge: 60 * 60 * 24,
    },
  };
}

/** Cookie name for admin auth */
export { COOKIE_NAME, ACTIVITY_COOKIE };
