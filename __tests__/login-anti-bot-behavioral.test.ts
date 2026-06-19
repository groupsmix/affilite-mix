/**
 * A86-2 / A95-3: Behavioral anti-bot test for login route.
 *
 * Asserts login's anti-automation posture (rate-limit ceilings, fail-closed
 * policies, account lockout) via import of the actual route constants rather
 * than source-text grep. This catches behavioral mutants and survives
 * harmless refactors.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock dependencies so we can invoke the handler without a real DB
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0, remaining: 99 }),
}));
vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
}));
vi.mock("@/lib/dal/admin-users", () => ({
  getAdminUserByEmail: vi.fn().mockResolvedValue(null),
  updateAdminUser: vi.fn(),
  incrementLoginFailedAttempts: vi.fn(),
  incrementTotpFailedAttempts: vi.fn(),
}));
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  authenticateUser: vi.fn().mockResolvedValue(null),
  createToken: vi.fn(),
  COOKIE_NAME: "admin_token",
  getAdminBindingCookie: vi.fn(),
  touchAdminActivity: vi.fn(),
  ACTIVITY_COOKIE: "admin_activity",
  BINDING_COOKIE: "admin_binding",
}));
vi.mock("@/lib/jwt-binding", () => ({
  computeRequestBinding: vi.fn().mockReturnValue("binding"),
}));
vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));
vi.mock("@/lib/totp", () => ({
  verifyTotpToken: vi.fn(),
  needsSha256Reenrollment: vi.fn().mockReturnValue(false),
  isSha1TotpPastDeadline: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/totp-encryption", () => ({
  decryptTotpSecret: vi.fn(),
}));
vi.mock("@/lib/security/disposable-email", () => ({
  validateNotDisposable: vi.fn().mockReturnValue(undefined),
}));
vi.mock("@/lib/audit-log", () => ({
  recordAuditEvent: vi.fn(),
}));
vi.mock("@/lib/runtime-env", () => ({
  getAppCacheKV: vi.fn().mockReturnValue(null),
}));

const { checkRateLimit } = await import("@/lib/rate-limit");
const mockedCheckRateLimit = vi.mocked(checkRateLimit);

describe("Login anti-bot behavioral assertions (A86-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckRateLimit.mockResolvedValue({ allowed: true, retryAfterMs: 0, remaining: 99 });
  });

  it("invokes rate-limit with fail-closed policy for global limiter", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });

    await POST(req);

    // Global rate-limit must be called with fail-closed
    const globalCall = mockedCheckRateLimit.mock.calls.find(([key]) => key === "login:global");
    expect(globalCall).toBeDefined();
    expect(globalCall![1]).toMatchObject({
      failPolicy: "closed",
    });
  });

  it("invokes rate-limit with fail-closed policy for IP limiter", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });

    await POST(req);

    const ipCall = mockedCheckRateLimit.mock.calls.find(
      ([key]) => typeof key === "string" && key.startsWith("login:") && key !== "login:global",
    );
    expect(ipCall).toBeDefined();
    expect(ipCall![1]).toMatchObject({
      failPolicy: "closed",
      maxRequests: 3,
    });
  });

  it("returns 429 when global rate-limit is exceeded", async () => {
    mockedCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 5000,
      remaining: 0,
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 429 when IP rate-limit is exceeded", async () => {
    // First call (global) succeeds, second call (IP) fails
    mockedCheckRateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfterMs: 0, remaining: 99 })
      .mockResolvedValueOnce({ allowed: false, retryAfterMs: 10000, remaining: 0 });

    const { POST } = await import("@/app/api/auth/login/route");
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "password123" }),
    });

    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("10");
  });

  it("returns 423 when account is locked (lockout active)", async () => {
    const { getAdminUserByEmail } = await import("@/lib/dal/admin-users");
    vi.mocked(getAdminUserByEmail).mockResolvedValueOnce({
      id: "user-1",
      email: "locked@example.com",
      login_locked_until: new Date(Date.now() + 60_000).toISOString(),
      login_failed_attempts: 10,
    } as never);

    const { POST } = await import("@/app/api/auth/login/route");
    const req = new NextRequest("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "locked@example.com", password: "password123" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(423);
  });
});
