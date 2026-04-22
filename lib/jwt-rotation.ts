/**
 * JWT Secret Rotation (§3.4)
 *
 * Supports JWT_SECRET_CURRENT + JWT_SECRET_PREVIOUS pair.
 * Sign with current, verify against both — enables zero-downtime rotation.
 */

import { SignJWT, jwtVerify, type JWTPayload } from "jose";

function getCurrentSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET_CURRENT || process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET_CURRENT or JWT_SECRET must be set");
  return new TextEncoder().encode(secret);
}

function getPreviousSecret(): Uint8Array | null {
  const secret = process.env.JWT_SECRET_PREVIOUS;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

/**
 * Sign a JWT with the current secret.
 */
export async function signToken(payload: JWTPayload, expiresIn: string = "24h"): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getCurrentSecret());
}

/**
 * Verify a JWT — tries current secret first, falls back to previous.
 * This enables zero-downtime secret rotation:
 * 1. Set JWT_SECRET_PREVIOUS = old secret
 * 2. Set JWT_SECRET_CURRENT = new secret
 * 3. Wait for old tokens to expire
 * 4. Remove JWT_SECRET_PREVIOUS
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  // Try current secret first
  try {
    const { payload } = await jwtVerify(token, getCurrentSecret());
    return payload;
  } catch {
    // Fall through to previous secret
  }

  // Try previous secret if configured
  const previousSecret = getPreviousSecret();
  if (previousSecret) {
    try {
      const { payload } = await jwtVerify(token, previousSecret);
      return payload;
    } catch {
      // Both secrets failed
    }
  }

  throw new Error("Invalid or expired token");
}
