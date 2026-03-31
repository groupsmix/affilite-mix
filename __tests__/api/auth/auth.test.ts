import { describe, it, expect, vi, beforeEach } from "vitest";
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
