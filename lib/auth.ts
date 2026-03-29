import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";
import { getAdminUserByEmail, hasAdminUsers } from "@/lib/dal/admin-users";
import { verifyPassword } from "@/lib/password";
import { requireEnvInProduction } from "@/lib/env";

const JWT_SECRET = requireEnvInProduction("JWT_SECRET", "dev-secret-change-me");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const COOKIE_NAME = "nh_admin_token";
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
 * Legacy: verify admin credentials using the shared ADMIN_PASSWORD env var.
 * Used as a fallback when no admin_users exist in the database.
 */
export function verifyLegacyPassword(password: string): boolean {
  if (!ADMIN_PASSWORD) return false;
  const encoder = new TextEncoder();
  const a = encoder.encode(password);
  const b = encoder.encode(ADMIN_PASSWORD);
  if (a.byteLength !== b.byteLength) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Authenticate a user. Tries per-user DB accounts first, then falls back
 * to the legacy ADMIN_PASSWORD env var if no admin_users exist.
 */
export async function authenticateUser(
  email: string | undefined,
  password: string,
): Promise<AdminPayload | null> {
  const dbUsersExist = await hasAdminUsers();

  if (dbUsersExist && email) {
    const user = await getAdminUserByEmail(email);
    if (!user) return null;

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return null;

    return {
      email: user.email,
      userId: user.id,
      role: user.role,
    };
  }

  // Fall back to legacy ADMIN_PASSWORD (no email needed)
  if (!dbUsersExist && verifyLegacyPassword(password)) {
    return { role: "admin" };
  }

  return null;
}

/** Create a signed JWT for admin session */
export async function createToken(payload: AdminPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .setAudience("nichehub")
    .setIssuer("nichehub")
    .sign(getSecretKey());
}

/** Verify and decode the admin JWT */
export async function verifyToken(
  token: string,
): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), {
      audience: "nichehub",
      issuer: "nichehub",
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
  return verifyToken(token);
}

/** Cookie name for admin auth */
export { COOKIE_NAME };
