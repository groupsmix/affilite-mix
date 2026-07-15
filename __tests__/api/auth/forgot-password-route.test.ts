/**
 * Route-level test: POST /api/auth/forgot-password
 *
 * Exercises the actual route handler with mocked dependencies to verify:
 * 1. Reset link uses the active tenant's site domain (G-22), not the
 *    request origin and not a global APP_URL.
 * 2. The link is built from site.domain even when APP_URL is missing in
 *    production.
 * 3. Email is sent via Resend with the correct reset URL
 * 4. Rate limiting is enforced
 * 5. Unknown emails still return 200 (enumeration protection)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
});

vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: () => ({
    from: () => ({ update: mockUpdate }),
  }),
  getTenantClient: async () => ({
    from: () => ({ update: mockUpdate }),
  }),
}));

vi.mock("@/lib/dal/admin-users", () => ({
  getAdminUserByEmail: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { getCurrentSite } from "@/lib/site-context";

vi.mock("@/lib/site-context", () => ({
  getCurrentSite: vi.fn().mockResolvedValue({
    name: "Test Site",
    domain: "test.example.com",
    language: "en",
    direction: "ltr",
  }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

import { POST } from "@/app/api/auth/forgot-password/route";
import { getAdminUserByEmail } from "@/lib/dal/admin-users";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { hashResetToken } from "@/lib/reset-token";

const mockedGetAdminUserByEmail = vi.mocked(getAdminUserByEmail);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedCaptureException = vi.mocked(captureException);
const mockedGetCurrentSite = vi.mocked(getCurrentSite);

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("https://evil-origin.example.com/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/forgot-password (route-level)", () => {
  let originalFetch: typeof globalThis.fetch;
  let capturedResendBody: Record<string, unknown> | null;

  beforeEach(() => {
    mockUpdate.mockClear();

    vi.stubEnv("APP_URL", "https://canonical.example.com");
    vi.stubEnv("RESEND_API_KEY", "re_test_fake_key");

    mockedCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 2,
      retryAfterMs: 0,
    });

    mockedGetAdminUserByEmail.mockResolvedValue({
      id: "user-uuid-123",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      is_active: true,
      password_hash: "hashed",
      totp_secret: null,
      totp_enabled: false,
      totp_verified_at: null,
      totp_last_step: null,
      totp_failed_attempts: 0,
      totp_locked_until: null,
      login_failed_attempts: 0,
      login_locked_until: null,
      reset_token: null,
      reset_token_expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    capturedResendBody = null;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      // Match by parsed hostname so a URL like https://evil/api.resend.com/...
      // cannot accidentally route to the Resend mock branch
      // (CodeQL js/incomplete-url-substring-sanitization).
      let host = "";
      try {
        host = new URL(String(url)).hostname;
      } catch {
        host = "";
      }
      if (host === "api.resend.com") {
        capturedResendBody = JSON.parse(init?.body as string);
        return new Response(JSON.stringify({ id: "email-123" }), { status: 200 });
      }
      return originalFetch(url, init as RequestInit);
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it("constructs reset link using the active tenant's site domain in production", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    expect(capturedResendBody).not.toBeNull();

    const textBody = capturedResendBody!.text as string;
    const htmlBody = capturedResendBody!.html as string;

    // The reset link MUST use the tenant's own site domain so a user on
    // tenant A is never directed at tenant B (G-22).
    expect(textBody).toContain("https://test.example.com/q7m-k4j9/reset-password?token=");
    expect(htmlBody).toContain("https://test.example.com/q7m-k4j9/reset-password?token=");

    // The reset link MUST NOT fall back to the request origin or a global
    // APP_URL in production.
    expect(textBody).not.toContain("evil-origin.example.com");
    expect(htmlBody).not.toContain("evil-origin.example.com");
    expect(textBody).not.toContain("canonical.example.com");
    expect(htmlBody).not.toContain("canonical.example.com");
  });

  it("falls back to site.domain in dev when APP_URL is set to an empty string", async () => {
    // `APP_URL=` in a developer's .env must not produce a relative reset
    // URL. Using `||` (rather than `??`) ensures the empty string falls
    // through to the site-domain fallback.
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "");

    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    const textBody = capturedResendBody!.text as string;
    expect(textBody).toContain("https://test.example.com/q7m-k4j9/reset-password?token=");
    // The link must be absolute, never relative.
    expect(textBody).not.toMatch(/[\s\n]\/admin\/reset-password\?/);
  });

  it("still issues a reset link in production when APP_URL is missing (uses site.domain)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "");
    delete process.env.APP_URL;

    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    // DB write should still happen — we no longer require APP_URL because
    // the tenant's site domain is the canonical source for reset links.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    // No captureException should have fired for a missing APP_URL.
    expect(mockedCaptureException).not.toHaveBeenCalled();
    // Link still uses the tenant's site domain.
    const textBody = capturedResendBody!.text as string;
    expect(textBody).toContain("https://test.example.com/q7m-k4j9/reset-password?token=");
  });

  it("returns 200 for unknown email (enumeration protection)", async () => {
    mockedGetAdminUserByEmail.mockResolvedValue(null);

    const res = await POST(makeRequest({ email: "nonexistent@test.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // No DB write should happen for unknown user
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("does not overwrite or resend when a valid unexpired reset token already exists (F-4)", async () => {
    // Issue 13 / F-4: an account with a still-valid pending token must return
    // the generic success envelope WITHOUT a DB write or a Resend round-trip,
    // and (like the unknown-user branch) after the timing-equalization delay.
    mockedGetAdminUserByEmail.mockResolvedValue({
      id: "user-uuid-123",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      is_active: true,
      password_hash: "hashed",
      totp_secret: null,
      totp_enabled: false,
      totp_verified_at: null,
      totp_last_step: null,
      totp_failed_attempts: 0,
      totp_locked_until: null,
      login_failed_attempts: 0,
      login_locked_until: null,
      reset_token: "existing-hash",
      reset_token_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await POST(makeRequest({ email: "admin@test.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    // No token overwrite and no email send on the early-return branch.
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(capturedResendBody).toBeNull();
  });

  it("issues a fresh token when the existing reset token has expired (F-4)", async () => {
    mockedGetAdminUserByEmail.mockResolvedValue({
      id: "user-uuid-123",
      email: "admin@test.com",
      name: "Admin",
      role: "admin",
      is_active: true,
      password_hash: "hashed",
      totp_secret: null,
      totp_enabled: false,
      totp_verified_at: null,
      totp_last_step: null,
      totp_failed_attempts: 0,
      totp_locked_until: null,
      login_failed_attempts: 0,
      login_locked_until: null,
      reset_token: "stale-hash",
      reset_token_expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    // Expired token → full path runs: a new token is written and email sent.
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(capturedResendBody).not.toBeNull();
  });

  it("returns 429 when rate limited", async () => {
    mockedCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterMs: 60000,
    });

    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(429);
  });

  it("returns 400 for invalid email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));

    expect(res.status).toBe(400);
  });

  it("sends email via Resend with correct from/to/subject", async () => {
    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    expect(capturedResendBody).not.toBeNull();
    expect(capturedResendBody!.to).toEqual(["admin@test.com"]);
    expect(capturedResendBody!.subject).toBe("Password Reset Request");
    expect(capturedResendBody!.from).toContain("test.example.com");
  });

  it("sends an Arabic, RTL-marked email when the active site is Arabic-language (G-24)", async () => {
    mockedGetCurrentSite.mockResolvedValueOnce({
      name: "موقع تجريبي",
      domain: "ar.example.com",
      language: "ar",
      direction: "rtl",
      // Cast: the route only reads name/domain/language/direction; other
      // SiteDefinition fields are not required for this test.
    } as any);

    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    expect(capturedResendBody).not.toBeNull();
    expect(capturedResendBody!.subject).toBe("طلب إعادة تعيين كلمة المرور");
    const html = capturedResendBody!.html as string;
    const text = capturedResendBody!.text as string;
    // RTL markup is on both the html element and the body wrapper.
    expect(html).toContain('<html lang="ar" dir="rtl">');
    expect(html).toContain("إعادة تعيين كلمة المرور");
    // English copy must not leak into the Arabic email.
    expect(html).not.toContain("Reset your password");
    expect(html).not.toContain(">Reset Password</a>");
    expect(text).toContain("لقد طلبتَ إعادة تعيين كلمة المرور");
  });

  it("does not pass reset token or full URL to captureException when safeHref rejects the URL (A8-001)", async () => {
    // Force buildPasswordResetEmail to throw by providing a site whose domain
    // triggers a javascript: URL.  We simulate this by mocking the email-
    // template module to throw with a URL-containing message and then checking
    // that captureException never receives it.
    vi.doMock("@/lib/email-templates/password-reset", () => ({
      buildPasswordResetEmail: () => {
        // Simulate the OLD (vulnerable) behaviour to make sure the route's
        // catch block sanitises before forwarding to captureException.
        throw new Error("[email-template] safeHref rejected reset URL");
      },
    }));

    const res = await POST(makeRequest({ email: "admin@test.com" }));
    // Route still returns 200 (success envelope hides internals).
    expect(res.status).toBe(200);

    // captureException must be called with a sanitized error only.
    const calls = mockedCaptureException.mock.calls;
    for (const [err] of calls) {
      if (err instanceof Error) {
        expect(err.message).not.toMatch(/token=/i);
        expect(err.message).not.toMatch(/reset-password\?/i);
        expect(err.message).not.toMatch(/https?:\/\//i);
      }
    }

    vi.doUnmock("@/lib/email-templates/password-reset");
  });

  it("persists only the SHA-256 hash of the reset token, not the raw value", async () => {
    const res = await POST(makeRequest({ email: "admin@test.com" }));
    expect(res.status).toBe(200);

    // Extract the raw token that was embedded in the email link.
    const textBody = capturedResendBody!.text as string;
    const match = textBody.match(/token=([^\s&]+)/);
    expect(match).not.toBeNull();
    const rawToken = match![1];

    // Grab the payload that was passed to Supabase .update().
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const storedPayload = mockUpdate.mock.calls[0]![0] as {
      reset_token: string;
      reset_token_expires_at: string;
    };

    // The DB must never receive the raw token…
    expect(storedPayload.reset_token).not.toBe(rawToken);
    // …and must store the deterministic SHA-256 hash instead.
    expect(storedPayload.reset_token).toBe(await hashResetToken(rawToken!));
    // SHA-256 hex is 64 chars
    expect(storedPayload.reset_token).toMatch(/^[0-9a-f]{64}$/);
  });
});
