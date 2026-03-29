import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getAdminUserByEmail } from "@/lib/dal/admin-users";
import { verifyPassword } from "@/lib/password";
import { requireEnvInProduction } from "@/lib/env";

const JWT_SECRET = requireEnvInProduction("JWT_SECRET", "dev-secret-change-me");
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

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;

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
