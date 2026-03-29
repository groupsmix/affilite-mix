import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { timingSafeEqual } from "crypto";

function requireEnvInProduction(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} environment variable is required in production`);
  }
  return fallback;
}

const JWT_SECRET = requireEnvInProduction("JWT_SECRET", "dev-secret-change-me");
const ADMIN_PASSWORD = requireEnvInProduction("ADMIN_PASSWORD", "admin");
const COOKIE_NAME = "nh_admin_token";
const EXPIRY = "24h";

function getSecretKey() {
  return new TextEncoder().encode(JWT_SECRET);
}

export interface AdminPayload {
  siteId?: string;
  role: "admin";
}

/** Verify admin credentials using timing-safe comparison */
export function verifyCredentials(password: string): boolean {
  const a = Buffer.from(password);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) {
    // Compare against self to keep constant time, then return false
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Create a signed JWT for admin session */
export async function createToken(payload: { role: "admin" }): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(getSecretKey());
}

/** Verify and decode the admin JWT */
export async function verifyToken(
  token: string,
): Promise<AdminPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
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
