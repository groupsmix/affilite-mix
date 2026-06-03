/**
 * Regression locks for the single-source-of-truth JWT timing constants
 * in `lib/auth-constants.ts`.
 *
 * Three independent surfaces consume the admin JWT lifetime:
 *   - `lib/auth.ts:EXPIRY` (passed to jose.SignJWT().setExpirationTime())
 *   - `lib/jwt-revocation.ts:REVOKED_TTL_SECONDS` (KV blocklist TTL)
 *   - `lib/auth.ts:adminCookieOptions.maxAge`
 *
 * These tests fail if any future edit re-introduces drift between them.
 */
import { describe, it, expect } from "vitest";
import {
  ADMIN_JWT_EXPIRY_SECONDS,
  ADMIN_JWT_EXPIRY_STRING,
  REVOKED_JWT_TTL_SECONDS,
  MAX_SESSION_AGE_REGULAR_SECONDS,
  MAX_SESSION_AGE_ADMIN_SECONDS,
} from "@/lib/auth-constants";

describe("auth-constants — single source of truth for JWT timing", () => {
  it("admin JWT expiry is 4 hours (F-SEC-03 floor)", () => {
    expect(ADMIN_JWT_EXPIRY_SECONDS).toBe(4 * 60 * 60);
  });

  it("expiry string is the seconds form (jose-compatible)", () => {
    expect(ADMIN_JWT_EXPIRY_STRING).toBe(`${ADMIN_JWT_EXPIRY_SECONDS}s`);
  });

  it("KV revocation TTL outlives JWT expiry by 5 minutes", () => {
    expect(REVOKED_JWT_TTL_SECONDS).toBe(ADMIN_JWT_EXPIRY_SECONDS + 5 * 60);
  });

  it("KV revocation TTL never undershoots JWT expiry", () => {
    // If this invariant is ever broken, a revoked jti would age out
    // of the blocklist while the matching JWT is still valid — i.e.
    // the revocation becomes a no-op for the last (drift) seconds.
    expect(REVOKED_JWT_TTL_SECONDS).toBeGreaterThanOrEqual(ADMIN_JWT_EXPIRY_SECONDS);
  });

  it("absolute session caps are at least as long as JWT expiry (A100-1)", () => {
    expect(MAX_SESSION_AGE_REGULAR_SECONDS).toBeGreaterThanOrEqual(ADMIN_JWT_EXPIRY_SECONDS);
    expect(MAX_SESSION_AGE_ADMIN_SECONDS).toBeGreaterThanOrEqual(ADMIN_JWT_EXPIRY_SECONDS);
  });

  it("super_admin cap is tighter than regular admin (A100-1)", () => {
    expect(MAX_SESSION_AGE_ADMIN_SECONDS).toBeLessThan(MAX_SESSION_AGE_REGULAR_SECONDS);
  });

  it("regular admin cap is 24 hours", () => {
    expect(MAX_SESSION_AGE_REGULAR_SECONDS).toBe(24 * 60 * 60);
  });

  it("super_admin cap is 12 hours", () => {
    expect(MAX_SESSION_AGE_ADMIN_SECONDS).toBe(12 * 60 * 60);
  });
});
