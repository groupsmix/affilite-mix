/**
 * Route-level test: POST /api/auth/forgot-password
 *
 * Exercises the actual route handler with mocked dependencies to verify:
 * 1. Reset link uses canonical APP_URL (not request origin)
 * 2. No DB write occurs when APP_URL is missing
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
}));

vi.mock("@/lib/dal/admin-users", () => ({
  getAdminUserByEmail: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/site-context", () => ({
  getCurrentSite: vi.fn().mockResolvedValue({
    name: "Test Site",
    domain: "test.example.com",
  }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

import { POST } from "@/app/api/auth/forgot-password/route";
import { getAdminUserByEmail } from "@/lib/dal/admin-users";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";

const mockedGetAdminUserByEmail = vi.mocked(getAdminUserByEmail);
const mockedCheckRateLimit = vi.mocked(checkRateLimit);
const mockedCaptureException = vi.mocked(captureException);

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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    mockUpdate.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });

    capturedResendBody = null;
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL, init?: RequestInit) => {
      if (String(url).includes("api.resend.com")) {
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

  it("constructs reset link using APP_URL, not request origin", async () => {
    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    expect(capturedResendBody).not.toBeNull();

    const textBody = capturedResendBody!.text as string;
    const htmlBody = capturedResendBody!.html as string;

    // The reset link MUST use the canonical APP_URL
    expect(textBody).toContain("https://canonical.example.com/admin/reset-password?token=");
    expect(htmlBody).toContain("https://canonical.example.com/admin/reset-password?token=");

    // The reset link MUST NOT use the request origin
    expect(textBody).not.toContain("evil-origin.example.com");
    expect(htmlBody).not.toContain("evil-origin.example.com");
  });

  it("does NOT write a reset token to DB when APP_URL is missing", async () => {
    vi.stubEnv("APP_URL", "");
    delete process.env.APP_URL;

    const res = await POST(makeRequest({ email: "admin@test.com" }));

    expect(res.status).toBe(200);
    // The Supabase update should never have been called
    expect(mockUpdate).not.toHaveBeenCalled();
    // captureException should have been called for the missing APP_URL
    expect(mockedCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "APP_URL environment variable is not configured" }),
      expect.any(Object),
    );
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
});
