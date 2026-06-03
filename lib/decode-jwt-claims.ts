import { decodeJwt } from "jose";

/**
 * A100-3: Safely extract the JTI (or any claim) from a JWT for revocation
 * without verifying the signature.
 *
 * Replaces the previous `JSON.parse(atob(base64))` pattern which was
 * vulnerable to prototype pollution via __proto__ or constructor keys
 * in the JWT payload. `jose.decodeJwt()` uses `JSON.parse` internally
 * but validates the token structure (three-part format, valid base64url)
 * and returns a frozen JWTPayload type — no prototype chain leakage.
 */
export function decodeJwtClaims(token: string): { jti?: string } | null {
  try {
    const payload = decodeJwt(token);
    return { jti: payload.jti };
  } catch {
    return null;
  }
}
