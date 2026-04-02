import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────
// Mock external dependencies so we can call the real route handlers
// without a running database or Turnstile service.

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/cookie-utils", () => ({
  IS_SECURE_COOKIE: false,
}));

// Mock authenticateUser to simulate DB user lookup
vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    authenticateUser: vi.fn(),
  };
});

// ── Helpers ──────────────────────────────────────────────────────

function makeLoginRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

// ── Integration tests: POST /api/auth/login ─────────────────────

describe("POST /api/auth/login (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({ password: "secret123" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it("returns 400 when email is invalid", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({ email: "not-an-email", password: "secret123" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it("returns 400 when password is missing", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({ email: "admin@example.com" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/password/i);
  });

  it("returns 401 when credentials are invalid", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue(null);

    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({ email: "admin@example.com", password: "wrong" });
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it("returns 200 with auth cookie on valid credentials", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      email: "admin@example.com",
      userId: "user-1",
      role: "admin",
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({
      email: "admin@example.com",
      password: "correct-password",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify auth cookie is set
    const setCookie = res.headers.getSetCookie();
    const authCookie = setCookie.find((c) => c.startsWith("nh_admin_token="));
    expect(authCookie).toBeDefined();
    expect(authCookie).toContain("HttpOnly");
  });

  it("returns 429 when rate limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 5000,
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({ email: "admin@example.com", password: "pass" });
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 403 when Turnstile verification fails", async () => {
    const { verifyTurnstile } = await import("@/lib/turnstile");
    vi.mocked(verifyTurnstile).mockResolvedValueOnce({
      success: false,
      error: "Captcha failed",
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({
      email: "admin@example.com",
      password: "pass",
      turnstileToken: "bad-token",
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/captcha/i);
  });

  it("includes rate limit headers in successful response", async () => {
    const { authenticateUser } = await import("@/lib/auth");
    vi.mocked(authenticateUser).mockResolvedValue({
      email: "admin@example.com",
      role: "admin",
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const req = makeLoginRequest({
      email: "admin@example.com",
      password: "correct",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("X-RateLimit-Limit")).toBeDefined();
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined();
  });

  it("returns 400 for malformed JSON body", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "127.0.0.1" },
      body: "not-valid-json{",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/json/i);
  });
});

// ── Integration tests: POST /api/auth/logout ────────────────────

describe("POST /api/auth/logout (integration)", () => {
  it("returns 200 and clears auth cookies", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    // Verify cookies are cleared (maxAge=0)
    const setCookie = res.headers.getSetCookie();
    const adminCookie = setCookie.find((c) => c.startsWith("nh_admin_token="));
    expect(adminCookie).toBeDefined();
    expect(adminCookie).toContain("Max-Age=0");

    const siteCookie = setCookie.find((c) => c.startsWith("nh_active_site="));
    expect(siteCookie).toBeDefined();
    expect(siteCookie).toContain("Max-Age=0");
  });
});
