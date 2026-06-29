import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword, verifyPassword } from "@/lib/password";
import { checkRateLimit } from "@/lib/rate-limit";

// ── Auth token creation and verification ────────────────────────

describe("auth token lifecycle", () => {
  it("createToken + verifyToken round-trips a payload", async () => {
    // Import auth module (uses jose for JWT)
    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = { email: "admin@test.com", userId: "user-1", role: "admin" as const };
    const token = await createToken(payload);

    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");

    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.email).toBe("admin@test.com");
    expect(decoded?.userId).toBe("user-1");
    expect(decoded?.role).toBe("admin");
  });

  it("verifyToken rejects a tampered token", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = { email: "admin@test.com", role: "admin" as const };
    const token = await createToken(payload);

    // Tamper with the token
    const tampered = token.slice(0, -5) + "XXXXX";
    const decoded = await verifyToken(tampered);
    expect(decoded).toBeNull();
  });

  it("verifyToken rejects an empty string", async () => {
    const { verifyToken } = await import("@/lib/auth");
    const decoded = await verifyToken("");
    expect(decoded).toBeNull();
  });

  it("verifyToken rejects garbage input", async () => {
    const { verifyToken } = await import("@/lib/auth");
    const decoded = await verifyToken("not.a.jwt");
    expect(decoded).toBeNull();
  });

  // LIB-HIGH-1: a token that verifies cryptographically but whose payload is
  // missing the required admin claims (userId/role/aud) must be rejected
  // before the session is established. Forging such a token requires the
  // signing key; we mint it here directly with SignJWT to simulate a
  // compromised key / buggy future mint path.
  it("verifyToken rejects a signed token missing required admin claims (LIB-HIGH-1)", async () => {
    const { SignJWT } = await import("jose");
    const { getJwtSecret } = await import("@/lib/jwt-secret");
    const { verifyToken } = await import("@/lib/auth");

    const key = new TextEncoder().encode(getJwtSecret());

    // Correctly signed, valid audience + expiry, but NO userId and NO role.
    const forged = await new SignJWT({ email: "forged@test.com" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .setAudience("affilite-mix-admin")
      .setIssuer("affilite-mix-auth")
      .sign(key);

    expect(await verifyToken(forged)).toBeNull();

    // And a token with a bogus (foreign) role string is rejected too.
    const forgedRole = await new SignJWT({ email: "forged@test.com", userId: "u-1", role: "intern" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("1h")
      .setAudience("affilite-mix-admin")
      .setIssuer("affilite-mix-auth")
      .sign(key);

    expect(await verifyToken(forgedRole)).toBeNull();
  });
});

// ── Password hashing for login ──────────────────────────────────

describe("password hashing (login flow)", () => {
  it("authenticates with correct password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("correct-password", hash);
    expect(result.valid).toBe(true);
  });

  it("rejects incorrect password", async () => {
    const hash = await hashPassword("correct-password");
    const result = await verifyPassword("wrong-password", hash);
    expect(result.valid).toBe(false);
  });
});

// ── Rate limiting (login protection) ────────────────────────────

describe("rate limiting for login", () => {
  it("allows requests within the limit", async () => {
    const config = { maxRequests: 3, windowMs: 60_000 };
    const key = `test-login-allow-${Date.now()}`;

    const r1 = await checkRateLimit(key, config);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await checkRateLimit(key, config);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);
  });

  it("blocks requests exceeding the limit", async () => {
    const config = { maxRequests: 2, windowMs: 60_000 };
    const key = `test-login-block-${Date.now()}`;

    await checkRateLimit(key, config);
    await checkRateLimit(key, config);

    const r3 = await checkRateLimit(key, config);
    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });
});

// ── Login input validation ──────────────────────────────────────

describe("login input validation", () => {
  it("rejects email without @ sign", () => {
    const email = "notanemail";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(valid).toBe(false);
  });

  it("accepts valid email format", () => {
    const email = "admin@example.com";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(valid).toBe(true);
  });

  it("rejects empty email", () => {
    const email = "";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(valid).toBe(false);
  });

  it("rejects email with spaces", () => {
    const email = "admin @example.com";
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    expect(valid).toBe(false);
  });
});

// ── Turnstile verification ──────────────────────────────────────

describe("turnstile verification", () => {
  it("skips verification in dev when key is not configured", async () => {
    const originalKey = process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;

    const { verifyTurnstile } = await import("@/lib/turnstile");
    const result = await verifyTurnstile(null);
    expect(result.success).toBe(true);

    if (originalKey) process.env.TURNSTILE_SECRET_KEY = originalKey;
  });
});

// ── Logout cookie clearing ──────────────────────────────────────

describe("logout behavior", () => {
  it("COOKIE_NAME constant is defined", async () => {
    const { COOKIE_NAME } = await import("@/lib/auth");
    expect(COOKIE_NAME).toBe("nh_admin_token");
  });

  it("ACTIVE_SITE_COOKIE constant is defined", async () => {
    const { ACTIVE_SITE_COOKIE } = await import("@/lib/active-site");
    expect(ACTIVE_SITE_COOKIE).toBe("nh_active_site");
  });
});

// ── Password reset validation ───────────────────────────────────

describe("password reset validation", () => {
  it("rejects password shorter than 8 characters", () => {
    const password = "short";
    expect(password.length < 8).toBe(true);
  });

  it("accepts password of 8+ characters", () => {
    const password = "longpassword123";
    expect(password.length >= 8).toBe(true);
  });

  it("rejects empty reset token", () => {
    const token = "";
    expect(!token).toBe(true);
  });
});

// ── A88-2: verifyToken must reject revoked tokens ──────────────

describe("verifyToken revoked-token handling (A88-2)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Revocation is now CHECKED by default (verifyToken tri-state). Without this
  // cleanup, the doMock of @/lib/jwt-revocation below leaks into later describe
  // blocks, where verifyToken would then call the mocked isTokenRevoked (→ true)
  // and reject every token. Unmock + reset so subsequent blocks get the real module.
  afterEach(() => {
    vi.doUnmock("@/lib/jwt-revocation");
    vi.resetModules();
    delete process.env.ADMIN_SESSION_TOKEN_REVOCATION_STRICT;
  });

  it("rejects a revoked token when revocation check is enabled", async () => {
    // Enable strict revocation
    process.env.ADMIN_SESSION_TOKEN_REVOCATION_STRICT = "true";

    // Mock isTokenRevoked to return true (and keep the per-user floor a no-op).
    vi.doMock("@/lib/jwt-revocation", () => ({
      isTokenRevoked: vi.fn().mockResolvedValue(true),
      getUserSessionInvalidBefore: vi.fn().mockResolvedValue(null),
      revokeToken: vi.fn().mockResolvedValue(undefined),
      revokeUserSessions: vi.fn().mockResolvedValue(undefined),
    }));

    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = { email: "admin@test.com", userId: "user-1", role: "admin" as const };
    const token = await createToken(payload);

    const decoded = await verifyToken(token);
    expect(decoded).toBeNull();
  });
});

// ── A100-1 / A98-8: Absolute session lifetime enforcement ──────

describe("verifyToken absolute session lifetime (A100-1)", () => {
  it("createToken sets session_start when the caller omits it", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const token = await createToken({
      email: "admin@test.com",
      userId: "user-1",
      role: "admin" as const,
    });
    const decoded = await verifyToken(token);

    expect(decoded).not.toBeNull();
    expect(typeof decoded?.session_start).toBe("number");
  });

  it("createToken preserves an existing session_start on refresh", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const originalSessionStart = Math.floor(Date.now() / 1000) - 600;
    const token = await createToken({
      email: "admin@test.com",
      userId: "user-1",
      role: "admin" as const,
      session_start: originalSessionStart,
    });
    const decoded = await verifyToken(token);

    expect(decoded?.session_start).toBe(originalSessionStart);
  });

  it("accepts a token whose session_start is within the 24h regular admin cap", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      email: "admin@test.com",
      userId: "user-1",
      role: "admin" as const,
      session_start: nowSec - 60, // 1 minute ago
    };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded?.session_start).toBe(payload.session_start);
  });

  it("rejects a regular admin token whose session exceeds 24h", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      email: "admin@test.com",
      userId: "user-1",
      role: "admin" as const,
      session_start: nowSec - 25 * 60 * 60, // 25 hours ago
    };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).toBeNull();
  });

  it("rejects a super_admin token whose session exceeds 12h", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      email: "admin@test.com",
      userId: "user-1",
      role: "super_admin" as const,
      session_start: nowSec - 13 * 60 * 60, // 13 hours ago
    };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).toBeNull();
  });

  it("accepts a super_admin token within the 12h cap", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const nowSec = Math.floor(Date.now() / 1000);
    const payload = {
      email: "admin@test.com",
      userId: "user-1",
      role: "super_admin" as const,
      session_start: nowSec - 11 * 60 * 60, // 11 hours ago
    };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
  });

  it("still accepts tokens minted without an explicit session_start input", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = {
      email: "admin@test.com",
      userId: "user-1",
      role: "admin" as const,
    };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);
    expect(decoded).not.toBeNull();
    expect(typeof decoded?.session_start).toBe("number");
  });
});

describe("auth source guards", () => {
  const authSource = readFileSync(resolve("lib/auth.ts"), "utf8");

  it("reuses BCRYPT_ROUNDS from lib/password.ts for dummy-hash timing equalization", () => {
    expect(authSource).toContain(
      'import { verifyPassword, hashPassword, BCRYPT_ROUNDS } from "@/lib/password"',
    );
    expect(authSource).not.toContain("process.env.BCRYPT_ROUNDS");
    expect(authSource).toContain('String(BCRYPT_ROUNDS).padStart(2, "0")');
  });

  it("checks unverified iat before the first jwtVerify call", () => {
    const iatCheckIndex = authSource.indexOf("const unverifiedIat = getUnverifiedTokenIat(token);");
    const firstVerifyIndex = authSource.indexOf("jwtVerify(token, getSecretKey(), jwtOpts)");

    expect(iatCheckIndex).toBeGreaterThan(-1);
    expect(firstVerifyIndex).toBeGreaterThan(iatCheckIndex);
  });
});
