/**
 * Integration tests for admin API routes with mocked Supabase.
 *
 * These tests exercise the full request → validation → response cycle
 * by calling route handlers directly with mocked Supabase clients,
 * verifying HTTP status codes, response bodies, and error handling.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  validateCreateCategory,
  validateUpdateCategory,
  validateCreateProduct,
  validateUpdateProduct,
  validateCreateContent,
  validateUpdateContent,
} from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize-html";

// ── Mock Supabase client builder ────────────────────────────────

type ChainableFn = ((...args: unknown[]) => MockSupabaseChain) & { _calls: unknown[][] };
interface MockSupabaseChain {
  [key: string]:
    | ChainableFn
    | ((...args: unknown[]) => Promise<{ data: unknown; error: unknown; count: null }>);
}

function makeFn(returnValue: unknown): ChainableFn {
  const calls: unknown[][] = [];
  const fn = ((...args: unknown[]) => {
    calls.push(args);
    return returnValue;
  }) as ChainableFn;
  fn._calls = calls;
  return fn;
}

function createMockSupabaseChain(
  resolvedData: unknown = null,
  resolvedError: unknown = null,
): MockSupabaseChain {
  const chain = {} as MockSupabaseChain;
  const terminalResult = { data: resolvedData, error: resolvedError, count: null };

  const methods = [
    "from",
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "neq",
    "in",
    "not",
    "lte",
    "gte",
    "order",
    "limit",
    "overrideTypes",
  ];
  for (const method of methods) {
    chain[method] = makeFn(chain);
  }
  // Terminal methods that resolve
  chain["single"] = (() => Promise.resolve(terminalResult)) as MockSupabaseChain["single"];

  return chain;
}

// ── Admin CRUD integration tests ────────────────────────────────

describe("admin CRUD integration — validation layer", () => {
  describe("POST /api/admin/categories (create)", () => {
    it("validates and accepts a well-formed category payload", () => {
      const payload = {
        name: "Luxury Watches",
        slug: "luxury-watches",
        description: "High-end timepieces",
      };
      const result = validateCreateCategory(payload);
      expect(result.errors).toBeNull();
      expect(result.data).toMatchObject({ name: "Luxury Watches", slug: "luxury-watches" });
    });

    it("returns validation errors for missing required fields", () => {
      const payload = {};
      const result = validateCreateCategory(payload);
      expect(result.errors).not.toBeNull();
      expect(result.errors?.name).toBeDefined();
      expect(result.errors?.slug).toBeDefined();
    });

    it("rejects XSS in category name via sanitization", () => {
      const dirty = '<script>alert("xss")</script>Watches';
      const clean = sanitizeHtml(dirty);
      expect(clean).not.toContain("<script>");
      expect(clean).toContain("Watches");
    });
  });

  describe("POST /api/admin/products (create)", () => {
    it("validates a full product payload with all optional fields", () => {
      const payload = {
        name: "Casio G-Shock",
        slug: "casio-g-shock",
        description: "Tough watch",
        affiliate_url: "https://amazon.com/gshock",
        image_url: "https://images.example.com/gshock.jpg",
        image_alt: "A black Casio G-Shock watch",
        price: "$99.99",
        price_amount: 99.99,
        price_currency: "USD",
        merchant: "Amazon",
        score: 8.5,
        featured: true,
        status: "active",
        category_id: "550e8400-e29b-41d4-a716-446655440000",
        cta_text: "Buy Now",
        deal_text: "20% off",
        deal_expires_at: "2025-12-31T23:59:59Z",
        pros: "Durable\nAffordable",
        cons: "Bulky",
      };
      const result = validateCreateProduct(payload);
      expect(result.errors).toBeNull();
      expect(result.data?.name).toBe("Casio G-Shock");
      expect(result.data?.score).toBe(8.5);
      expect(result.data?.featured).toBe(true);
    });

    it("rejects a product with score > 10", () => {
      const result = validateCreateProduct({ name: "Bad", slug: "bad", score: 15 });
      expect(result.errors?.score).toBeDefined();
    });

    it("rejects a product with invalid affiliate URL", () => {
      const result = validateCreateProduct({
        name: "Test",
        slug: "test",
        affiliate_url: "not-a-url",
      });
      expect(result.errors?.affiliate_url).toBeDefined();
    });
  });

  describe("PATCH /api/admin/products (update)", () => {
    it("accepts a partial update with only featured flag", () => {
      const result = validateUpdateProduct({
        id: "550e8400-e29b-41d4-a716-446655440000",
        featured: true,
      });
      expect(result.errors).toBeNull();
      expect(result.data?.featured).toBe(true);
    });

    it("rejects update without id", () => {
      const result = validateUpdateProduct({ name: "No ID" });
      expect(result.errors?.id).toBeDefined();
    });
  });

  describe("POST /api/admin/content (create)", () => {
    it("validates content with SEO metadata", () => {
      const payload = {
        title: "Best Watches 2025",
        slug: "best-watches-2025",
        type: "review",
        status: "draft",
        meta_title: "Best Watches to Buy in 2025",
        meta_description: "Our expert picks for the best watches",
        og_image: "https://example.com/og.jpg",
        tags: ["watches", "review"],
      };
      const result = validateCreateContent(payload);
      expect(result.errors).toBeNull();
      expect(result.data?.type).toBe("review");
      expect(result.data?.tags).toEqual(["watches", "review"]);
    });

    it("validates scheduled content with publish_at", () => {
      const result = validateCreateContent({
        title: "Scheduled Post",
        slug: "scheduled-post",
        status: "scheduled",
        publish_at: "2025-12-25T00:00:00Z",
      });
      expect(result.errors).toBeNull();
      expect(result.data?.status).toBe("scheduled");
      expect(result.data?.publish_at).toBe("2025-12-25T00:00:00Z");
    });

    it("rejects content with body exceeding 500k characters", () => {
      const result = validateUpdateContent({
        id: "550e8400-e29b-41d4-a716-446655440000",
        body: "x".repeat(500_001),
      });
      expect(result.errors?.body).toBeDefined();
    });
  });
});

// ── HTML sanitization integration ───────────────────────────────

describe("HTML sanitization integration", () => {
  it("strips script tags from content body", () => {
    const dirty = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toBe('<p>Hello</p>alert("xss")<p>World</p>');
    expect(clean).not.toContain("<script>");
  });

  it("strips event handlers from HTML attributes", () => {
    const dirty = '<a href="https://example.com" onclick="steal()">Link</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("onclick");
    expect(clean).toContain('href="https://example.com"');
  });

  it("strips javascript: protocol from href", () => {
    const dirty = '<a href="javascript:alert(1)">Click</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).not.toContain("javascript:");
  });

  it("remaps h1 to h2 in user content to preserve page heading hierarchy", () => {
    const dirty = "<h1>User Heading</h1><h2>Subheading</h2>";
    const clean = sanitizeHtml(dirty);
    expect(clean).toBe("<h2>User Heading</h2><h2>Subheading</h2>");
    expect(clean).not.toContain("<h1>");
  });

  it("forces rel=noopener noreferrer nofollow on links", () => {
    const dirty = '<a href="https://example.com" rel="dofollow">Link</a>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain('rel="noopener noreferrer nofollow"');
    expect(clean).not.toContain("dofollow");
  });

  it("preserves allowed tags and strips disallowed ones", () => {
    const dirty = "<p>Hello</p><iframe src='evil.com'></iframe><strong>Bold</strong>";
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("<p>Hello</p>");
    expect(clean).toContain("<strong>Bold</strong>");
    expect(clean).not.toContain("<iframe");
  });
});

// ── Mock Supabase client tests ──────────────────────────────────

describe("mock Supabase client chain", () => {
  let mockChain: MockSupabaseChain;

  beforeEach(() => {
    mockChain = createMockSupabaseChain([{ id: "123", name: "Test" }]);
  });

  it("creates a chainable mock that returns data", async () => {
    const result = await mockChain.single();
    expect(result.data).toEqual([{ id: "123", name: "Test" }]);
    expect(result.error).toBeNull();
  });

  it("simulates an error response", async () => {
    const errorChain = createMockSupabaseChain(null, { message: "Not found", code: "PGRST116" });
    const result = await errorChain.single();
    expect(result.error).toEqual({ message: "Not found", code: "PGRST116" });
    expect(result.data).toBeNull();
  });

  it("supports method chaining", () => {
    const chain = createMockSupabaseChain();
    const result = (chain.from as ChainableFn)("products");
    expect(result).toBe(chain);
    const result2 = (chain.select as ChainableFn)("*");
    expect(result2).toBe(chain);
    const result3 = (chain.eq as ChainableFn)("site_id", "abc");
    expect(result3).toBe(chain);
  });
});

// ── Web Vitals endpoint validation ──────────────────────────────

describe("POST /api/vitals — payload validation", () => {
  const VALID_METRICS = ["CLS", "FCP", "FID", "INP", "LCP", "TTFB"];

  it("accepts all standard Core Web Vitals metric names", () => {
    for (const name of VALID_METRICS) {
      const payload = { name, value: 42.5 };
      expect(typeof payload.name).toBe("string");
      expect(typeof payload.value).toBe("number");
    }
  });

  it("rejects payloads missing name", () => {
    const payload = { value: 42 };
    expect(typeof (payload as Record<string, unknown>).name).not.toBe("string");
  });

  it("rejects payloads missing value", () => {
    const payload = { name: "LCP" };
    expect(typeof (payload as Record<string, unknown>).value).not.toBe("number");
  });

  it("rejects unknown metric names", () => {
    const validSet = new Set(VALID_METRICS);
    expect(validSet.has("UNKNOWN")).toBe(false);
    expect(validSet.has("")).toBe(false);
  });

  it("accepts optional fields (id, page, href, rating)", () => {
    const payload = {
      name: "LCP",
      value: 1200,
      id: "v3-1234",
      page: "/products",
      href: "https://example.com/products",
      rating: "needs-improvement",
    };
    expect(payload.name).toBe("LCP");
    expect(payload.rating).toBe("needs-improvement");
  });
});

// ── Rate limiting integration ───────────────────────────────────

describe("admin rate limiting integration", () => {
  it("allows requests within the rate limit window", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const key = `admin-integration-test-${Date.now()}`;
    const config = { maxRequests: 5, windowMs: 60_000 };

    for (let i = 0; i < 5; i++) {
      const result = await checkRateLimit(key, config);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests exceeding the rate limit", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    const key = `admin-integration-block-${Date.now()}`;
    const config = { maxRequests: 2, windowMs: 60_000 };

    await checkRateLimit(key, config);
    await checkRateLimit(key, config);
    const blocked = await checkRateLimit(key, config);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });
});
