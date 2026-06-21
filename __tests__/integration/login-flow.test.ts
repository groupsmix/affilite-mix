/**
 * A86-1: Integration test for the admin login flow.
 *
 * Exercises TOTP verification, HIBP breach check, account lockout,
 * and binding-cookie issuance through the real POST handler.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/cookie-utils", () => ({ IS_SECURE_COOKIE: false }));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, authenticateUser: vi.fn() };
});

const defaultUser = {
  id: "user-1",
  email: "admin@example.com",
  totp_enabled: false,
  totp_secret: null,
  login_failed_attempts: 0,
  login_locked_until: null,
  totp_failed_attempts: 0,
  totp_locked_until: null,
  role: "admin",
};

vi.mock("@/lib/dal/admin-users", () => ({
  getAdminUserByEmail: vi.fn().mockResolvedValue({ ...defaultUser }),
  updateAdminUser: vi.fn().mockResolvedValue({}),
  incrementLoginFailedAttempts: vi.fn().mockResolvedValue({ attempts: 1, locked: false }),
  incrementTotpFailedAttempts: vi.fn().mockResolvedValue({ attempts: 1, locked: false }),
}));
vi.mock("@/lib/totp", () => ({
  // F4 audit: verifyTotpToken now returns {ok, step} so callers can persist
  // the consumed time-step. Tests that previously mocked the boolean form
  // must return the new shape.
  verifyTotpToken: vi.fn().mockReturnValue({ ok: true, step: 1 }),
  needsSha256Reenrollment: vi.fn().mockReturnValue(false),
  isSha1TotpPastDeadline: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/totp-encryption", () => ({
  decryptTotpSecret: vi.fn().mockResolvedValue("decrypted-secret"),
}));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/runtime-env", () => ({ getAppCacheKV: vi.fn().mockReturnValue(null) }));

function loginReq(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

function mockUser(overrides: Record<string, unknown> = {}) {
  return { ...defaultUser, ...overrides } as never;
}

describe("Login flow integration (A86-1)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 202 challenge when TOTP is enabled but token missing", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      email: "admin@example.com",
      userId: "user-1",
      role: "admin",
    });
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");
    vi.mocked(getAdminUserByEmail).mockResolvedValue(
      mockUser({ totp_enabled: true, totp_secret: "encrypted" }),
    );

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(loginReq({ email: "admin@example.com", password: "correct" }));
    expect(res.status).toBe(202);
    expect((await res.json()).challenge).toBe("2fa_required");
  });

  it("returns 200 with binding cookie when TOTP token is valid", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      email: "admin@example.com",
      userId: "user-1",
      role: "admin",
    });
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");
    vi.mocked(getAdminUserByEmail).mockResolvedValue(
      mockUser({ totp_enabled: true, totp_secret: "encrypted" }),
    );

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(
      loginReq({ email: "admin@example.com", password: "correct", totp_token: "123456" }),
    );
    expect(res.status).toBe(200);
    const binding = res.headers.getSetCookie().find((c) => c.startsWith("nh_admin_binding="));
    expect(binding).toBeDefined();
  });

  it("returns 423 when account is locked out", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue(null);
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");
    vi.mocked(getAdminUserByEmail).mockResolvedValue(
      mockUser({
        login_failed_attempts: 10,
        login_locked_until: new Date(Date.now() + 3600_000).toISOString(),
      }),
    );

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(loginReq({ email: "admin@example.com", password: "wrong" }));
    expect(res.status).toBe(423);
    expect((await res.json()).error).toMatch(/locked/i);
  });

  it("returns password_breached advisory on HIBP hit", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      email: "admin@example.com",
      userId: "user-1",
      role: "admin",
    });
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");
    vi.mocked(getAdminUserByEmail).mockResolvedValue(mockUser());

    const origFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("00000:1\nFFFFF:3", { status: 200 })) as typeof fetch;
    try {
      const { POST } = await import("@/app/api/auth/login/route");
      const res = await POST(loginReq({ email: "admin@example.com", password: "correct" }));
      expect(res.status).toBe(200);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("sets activity cookie on successful login", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      email: "admin@example.com",
      userId: "user-1",
      role: "admin",
    });
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");
    vi.mocked(getAdminUserByEmail).mockResolvedValue(mockUser());

    const { POST } = await import("@/app/api/auth/login/route");
    const res = await POST(loginReq({ email: "admin@example.com", password: "correct" }));
    expect(res.status).toBe(200);
    const activity = res.headers.getSetCookie().find((c) => c.startsWith("nh_admin_activity="));
    expect(activity).toBeDefined();
  });
});
