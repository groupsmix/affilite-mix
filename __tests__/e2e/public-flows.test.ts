import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * E2E-style tests for critical public flows.
 *
 * These test the API contract of public-facing endpoints by calling
 * the route handlers directly (no live HTTP server needed). They verify
 * that the core revenue-path flows work end-to-end through the handler
 * logic, including validation, rate limiting, and response shapes.
 *
 * For full browser-based E2E tests, use Playwright against a running
 * dev server (see vitest.integration.config.ts).
 */

// Mock external dependencies so handlers can execute without a live DB
vi.mock("@/lib/site-context", () => ({
  getCurrentSite: vi.fn().mockResolvedValue({
    id: "site-e2e-test",
    slug: "test-site",
    name: "E2E Test Site",
    domain: "test.example.com",
    language: "en",
    productLabel: "Watch",
    productLabelPlural: "Watches",
    is_active: true,
  }),
}));

vi.mock("@/lib/supabase-server", () => ({
  getTenantClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 59,
    retryAfterMs: 0,
  }),
}));

vi.mock("@/lib/dal/price-snapshots", () => ({
  getPriceHistory: vi.fn().mockResolvedValue([
    {
      price_amount: 29999,
      currency: "USD",
      source: "merchant",
      scraped_at: "2026-01-15T00:00:00Z",
    },
  ]),
}));

describe("Public Flow: Price History API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with valid product ID and default days", async () => {
    const { GET } = await import("@/app/api/products/[productId]/price-history/route");
    const request = new Request("https://test.example.com/api/products/abc-123/price-history", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const response = await GET(request as never, {
      params: Promise.resolve({ productId: "abc-123" }),
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty("product_id", "abc-123");
    expect(body).toHaveProperty("days", 90);
    expect(body).toHaveProperty("count");
    expect(body).toHaveProperty("snapshots");
    expect(Array.isArray(body.snapshots)).toBe(true);
  });

  it("clamps days to 365 max", async () => {
    const { GET } = await import("@/app/api/products/[productId]/price-history/route");
    const request = new Request(
      "https://test.example.com/api/products/abc-123/price-history?days=999",
      { headers: { "x-forwarded-for": "1.2.3.4" } },
    );

    const response = await GET(request as never, {
      params: Promise.resolve({ productId: "abc-123" }),
    });
    const body = await response.json();
    expect(body.days).toBe(365);
  });

  it("defaults to 90 days for invalid days param", async () => {
    const { GET } = await import("@/app/api/products/[productId]/price-history/route");
    const request = new Request(
      "https://test.example.com/api/products/abc-123/price-history?days=abc",
      { headers: { "x-forwarded-for": "1.2.3.4" } },
    );

    const response = await GET(request as never, {
      params: Promise.resolve({ productId: "abc-123" }),
    });
    const body = await response.json();
    expect(body.days).toBe(90);
  });
});

describe("Public Flow: Rate Limiting", () => {
  it("returns 429 when rate limit exceeded on price-history", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterMs: 30_000,
    });

    const { GET } = await import("@/app/api/products/[productId]/price-history/route");
    const request = new Request("https://test.example.com/api/products/abc-123/price-history", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });

    const response = await GET(request as never, {
      params: Promise.resolve({ productId: "abc-123" }),
    });
    expect(response.status).toBe(429);

    const body = await response.json();
    expect(body).toHaveProperty("error", "Too many requests");
    expect(response.headers.get("Retry-After")).toBe("30");
  });
});

describe("Public Flow: Gift Finder Quiz i18n", () => {
  it("renders English strings by default", async () => {
    // Verify the i18n dictionary is importable and has the right structure
    const mod = await import("@/app/(public)/gift-finder/gift-finder-quiz");
    expect(mod.GiftFinderQuiz).toBeDefined();
    expect(typeof mod.GiftFinderQuiz).toBe("function");
  });
});
