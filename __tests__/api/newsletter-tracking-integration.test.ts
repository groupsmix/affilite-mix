import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

// Mock Supabase service client
const mockFrom = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
  getTenantClient: vi.fn(async () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  })),
}));

// Mock site context
vi.mock("@/lib/site-context", () => ({
  getCurrentSite: vi.fn().mockResolvedValue({
    id: "site-uuid-123",
    name: "TestSite",
    domain: "test.example.com",
    language: "en",
    theme: { accentColor: "#10B981" },
    features: { newsletter: true },
  }),
  getSiteIdFromHeader: vi.fn().mockReturnValue("test-site"),
}));

// Mock DAL modules for click tracking
const mockGetProductBySlug = vi.fn();
const mockPublishClick = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/dal/products", () => ({
  getProductBySlug: (...args: unknown[]) => mockGetProductBySlug(...args),
}));
vi.mock("@/lib/click-queue", () => ({
  publishClick: (...args: unknown[]) => mockPublishClick(...args),
}));
vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn().mockResolvedValue("site-uuid-123"),
  resolveDbSiteBySlug: vi.fn().mockResolvedValue(null),
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeNewsletterRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/newsletter", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "127.0.0.1",
      "x-site-id": "test-site",
    },
    body: JSON.stringify(body),
  });
}

function makeClickRequest(
  params: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): NextRequest {
  const url = new URL("http://localhost:3000/api/track/click");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url.toString(), {
    method: "GET",
    headers: {
      "x-forwarded-for": "127.0.0.1",
      "x-site-id": "test-site",
      ...extraHeaders,
    },
  });
}

// ── Integration tests: POST /api/newsletter ─────────────────────

describe("POST /api/newsletter (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: no existing subscriber
    mockFrom.mockReturnValue({
      select: (..._args: unknown[]) => ({
        eq: (..._eqArgs: unknown[]) => ({
          eq: (..._eq2Args: unknown[]) => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      insert: (..._args: unknown[]) => Promise.resolve({ error: null }),
    });
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("@/app/api/newsletter/route");
    const req = makeNewsletterRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it("returns 400 for invalid email format", async () => {
    const { POST } = await import("@/app/api/newsletter/route");
    const req = makeNewsletterRequest({ email: "not-an-email" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/email/i);
  });

  it("subscribes a new user successfully", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
      insert: () => Promise.resolve({ error: null }),
    });

    const { POST } = await import("@/app/api/newsletter/route");
    const req = makeNewsletterRequest({ email: "user@example.com" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/check your email/i);
  });

  it("returns success for already-confirmed subscriber", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { id: "sub-1", status: "active", confirmed_at: "2025-01-01" },
                error: null,
              }),
          }),
        }),
      }),
    });

    const { POST } = await import("@/app/api/newsletter/route");
    const req = makeNewsletterRequest({ email: "existing@example.com" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.message).toMatch(/already subscribed/i);
  });

  it("returns 429 when rate limited", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 5000,
    });

    const { POST } = await import("@/app/api/newsletter/route");
    const req = makeNewsletterRequest({ email: "user@example.com" });
    const res = await POST(req);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeDefined();
  });

  it("returns 403 when Turnstile fails", async () => {
    const { verifyTurnstile } = await import("@/lib/turnstile");
    vi.mocked(verifyTurnstile).mockResolvedValueOnce({
      success: false,
      error: "Captcha failed",
    });

    const { POST } = await import("@/app/api/newsletter/route");
    const req = makeNewsletterRequest({
      email: "user@example.com",
      turnstileToken: "bad",
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/captcha/i);
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await import("@/app/api/newsletter/route");
    const req = new Request("http://localhost:3000/api/newsletter", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "127.0.0.1",
        "x-site-id": "test-site",
      },
      body: "not-json{",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});

// ── Integration tests: GET /api/track/click ─────────────────────

describe("GET /api/track/click (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when product slug is missing", async () => {
    const { GET } = await import("@/app/api/track/click/route");
    const req = makeClickRequest({});
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing/i);
  });

  it("returns 404 when product is not found", async () => {
    mockGetProductBySlug.mockResolvedValue(null);

    const { GET } = await import("@/app/api/track/click/route");
    const req = makeClickRequest({ p: "nonexistent-product" });
    const res = await GET(req);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/not found/i);
  });

  it("redirects to affiliate URL and records click", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-1",
      name: "Test Product",
      slug: "test-product",
      affiliate_url: "https://amazon.com/dp/test",
    });

    const { GET } = await import("@/app/api/track/click/route");
    // Simulate a trusted top-level navigation (e.g. user clicking a link in
    // their email client). sec-fetch-site: "none" is what browsers send for
    // direct navigations and email-client clicks (A3-002 fix).
    const req = makeClickRequest(
      { p: "test-product", t: "review-page" },
      { "sec-fetch-site": "none", "sec-fetch-dest": "document" },
    );
    const res = await GET(req);

    // Should be a 302 redirect
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://amazon.com/dp/test");

    // Should record the click
    expect(mockPublishClick).toHaveBeenCalledWith(
      expect.objectContaining({
        site_id: "site-uuid-123",
        product_name: "Test Product",
        affiliate_url: "https://amazon.com/dp/test",
        content_slug: "review-page",
      }),
    );
  });

  it("redirects even when rate limited (API-03: analytics skipped, redirect preserved)", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    vi.mocked(checkRateLimit).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 1000,
    });

    const { GET } = await import("@/app/api/track/click/route");
    const req = makeClickRequest({ p: "test-product" });
    const res = await GET(req);

    // API-03: Rate-limited clicks still redirect to preserve affiliate revenue.
    // Analytics recording is skipped but the user reaches the destination.
    expect(res.status).toBe(302);
  });

  it("returns 404 when product has no affiliate URL", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-2",
      name: "No Link Product",
      slug: "no-link",
      affiliate_url: null,
    });

    const { GET } = await import("@/app/api/track/click/route");
    const req = makeClickRequest({ p: "no-link" });
    const res = await GET(req);

    expect(res.status).toBe(404);
  });

  it("returns 400 when the stored affiliate URL is not HTTPS", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-3",
      name: "Insecure Link Product",
      slug: "insecure-link",
      affiliate_url: "http://amazon.com/insecure",
    });

    const { GET } = await import("@/app/api/track/click/route");
    const req = makeClickRequest({ p: "insecure-link" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid affiliate url scheme/i);
  });

  it("returns 400 when the stored affiliate URL domain is off the allow-list", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-4",
      name: "Offlist Link Product",
      slug: "offlist-link",
      affiliate_url: "https://evil.example/phish",
    });

    const { GET } = await import("@/app/api/track/click/route");
    const req = makeClickRequest({ p: "offlist-link" });
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/not allowed/i);
  });

  it("ignores any querystring url parameter and redirects only to the stored affiliate URL", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-5",
      name: "Stored Link Product",
      slug: "stored-link",
      affiliate_url: "https://amazon.com/dp/stored",
    });

    const { GET } = await import("@/app/api/track/click/route");
    const req = makeClickRequest({
      p: "stored-link",
      t: "review-page",
      url: "https://evil.example/override",
    }, { "sec-fetch-site": "none", "sec-fetch-dest": "document" });
    const res = await GET(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://amazon.com/dp/stored");
    expect(mockPublishClick).toHaveBeenCalledWith(
      expect.objectContaining({
        affiliate_url: "https://amazon.com/dp/stored",
      }),
    );
  });
});

// ── Integration tests: POST /api/track/click (sendBeacon) ───────

describe("POST /api/track/click (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles POST requests the same as GET (sendBeacon support)", async () => {
    mockGetProductBySlug.mockResolvedValue({
      id: "prod-1",
      name: "Beacon Product",
      slug: "beacon-product",
      affiliate_url: "https://amazon.com/affiliate",
    });

    const { POST } = await import("@/app/api/track/click/route");
    // FRESH-03: sendBeacon-style POST requires a valid Origin matching a
    // verified site (static config OR DB-resolved x-site-id).
    const url = new URL("https://compareai.site/api/track/click");
    url.searchParams.set("p", "beacon-product");
    const req = new NextRequest(url.toString(), {
      method: "POST",
      headers: {
        "x-forwarded-for": "127.0.0.1",
        "x-site-id": "ai-compared",
        host: "compareai.site",
        origin: "https://compareai.site",
      },
    });
    const res = await POST(req);

    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe("https://amazon.com/affiliate");
  });
});

// ── Integration tests: POST /api/cron/publish ───────────────────

describe("POST /api/cron/publish (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without CRON_SECRET", async () => {
    const original = process.env.CRON_SECRET;
    delete process.env.CRON_SECRET;

    const { POST } = await import("@/app/api/cron/publish/route");
    const req = new NextRequest("http://localhost:3000/api/cron/publish", {
      method: "POST",
    });
    const res = await POST(req);

    expect(res.status).toBe(401);

    if (original) process.env.CRON_SECRET = original;
  });

  it("returns 401 with wrong bearer token", async () => {
    const original = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "correct-secret";

    const { POST } = await import("@/app/api/cron/publish/route");
    const req = new NextRequest("http://localhost:3000/api/cron/publish", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);

    if (original) {
      process.env.CRON_SECRET = original;
    } else {
      delete process.env.CRON_SECRET;
    }
  });
});
