import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RISK-01 (étap-3): Data export endpoint requires email verification.
 *
 * Tests the two-step verification flow:
 *   1. POST /api/user/data-export { email } → stores verification code in KV
 *   2. GET /api/user/data-export?email=X&code=Y → returns data only with valid code
 */

// --- KV mock ----------------------------------------------------------------
const kvStore = new Map<string, string>();
const mockKV = {
  get: vi.fn(async (key: string) => kvStore.get(key) ?? null),
  put: vi.fn(async (key: string, value: string) => {
    kvStore.set(key, value);
  }),
  delete: vi.fn(async (key: string) => {
    kvStore.delete(key);
  }),
};

vi.mock("@/lib/runtime-env", () => ({
  getAppCacheKV: () => mockKV,
  getRateLimitKV: () => null,
  getRateLimiterDO: () => null,
  getClickQueue: () => null,
  getAuditArchiveR2: () => null,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
  getKVNamespace: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

// A47-02: Turnstile CAPTCHA is required on GET. Mock as always-success here
// so the test can focus on the verification-code logic; turnstile gating is
// covered elsewhere.
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn().mockResolvedValue("test-site-uuid"),
}));

vi.mock("@/lib/supabase-server", () => ({
  getTenantClient: vi.fn().mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: [], error: null }),
        }),
      }),
    }),
  }),
}));

describe("Data export verification flow", () => {
  beforeEach(() => {
    kvStore.clear();
    vi.clearAllMocks();
  });

  it("GET without code returns 400 requesting verification", async () => {
    const { GET } = await import("@/app/api/user/data-export/route");

    const url = new URL(
      "https://example.com/api/user/data-export?email=test@example.com&turnstile_token=test",
    );
    const request = new Request(url.toString(), {
      headers: new Headers({ "x-site-id": "test-site" }),
    });
    Object.defineProperty(request, "nextUrl", {
      value: url,
      writable: false,
    });

    const response = await GET(request as never);
    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error).toContain("verification code");
  });

  it("GET with invalid code returns 403", async () => {
    const { GET } = await import("@/app/api/user/data-export/route");

    const url = new URL(
      "https://example.com/api/user/data-export?email=test@example.com&code=000000&turnstile_token=test",
    );
    const request = new Request(url.toString(), {
      headers: new Headers({ "x-site-id": "test-site" }),
    });
    Object.defineProperty(request, "nextUrl", {
      value: url,
      writable: false,
    });

    const response = await GET(request as never);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toContain("Invalid or expired");
  });

  it("POST stores a verification code and returns success message", async () => {
    const { POST } = await import("@/app/api/user/data-export/route");

    const url = new URL("https://example.com/api/user/data-export");
    const request = new Request(url.toString(), {
      method: "POST",
      headers: new Headers({
        "x-site-id": "test-site",
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ email: "test@example.com" }),
    });
    Object.defineProperty(request, "nextUrl", {
      value: url,
      writable: false,
    });

    const response = await POST(request as never);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.message).toContain("verification code");

    // A code should have been stored in KV
    expect(mockKV.put).toHaveBeenCalledTimes(1);
  });

  it("POST response is identical regardless of email existence (anti-enumeration)", async () => {
    const { POST } = await import("@/app/api/user/data-export/route");

    const makeReq = (email: string) => {
      const url = new URL("https://example.com/api/user/data-export");
      const req = new Request(url.toString(), {
        method: "POST",
        headers: new Headers({
          "x-site-id": "test-site",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ email }),
      });
      Object.defineProperty(req, "nextUrl", { value: url, writable: false });
      return req;
    };

    const r1 = await POST(makeReq("existing@example.com") as never);
    const r2 = await POST(makeReq("nonexistent@example.com") as never);

    expect(r1.status).toBe(r2.status);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.message).toBe(b2.message);
  });
});
