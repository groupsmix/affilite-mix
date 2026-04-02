import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/cookie-utils", () => ({
  IS_SECURE_COOKIE: false,
}));

// Mock admin guard — simulate authenticated admin session
const mockRequireAdmin = vi.fn();
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  requireSuperAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  assertRole: vi.fn().mockReturnValue(null),
}));

// Mock DAL modules
const mockListCategories = vi.fn();
const mockCreateCategory = vi.fn();
const mockUpdateCategory = vi.fn();
const mockDeleteCategory = vi.fn();
const mockGetCategoryUsageCounts = vi.fn();
vi.mock("@/lib/dal/categories", () => ({
  listCategories: (...args: unknown[]) => mockListCategories(...args),
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
  getCategoryUsageCounts: (...args: unknown[]) => mockGetCategoryUsageCounts(...args),
}));

// Mock audit log & revalidation (fire-and-forget)
vi.mock("@/lib/audit-log", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────

const VALID_SESSION = {
  error: null,
  session: { email: "admin@test.com", userId: "user-1", role: "admin" as const },
  dbSiteId: "site-uuid-123",
  siteSlug: "test-site",
};

const UNAUTH_RESULT = {
  error: new (await import("next/server")).NextResponse(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  }),
  session: null,
  dbSiteId: null,
  siteSlug: null,
};

function makeCategoryRequest(method: string, body?: Record<string, unknown>): NextRequest {
  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) init.body = JSON.stringify(body);
  return new NextRequest("http://localhost:3000/api/admin/categories", init);
}

// ── Integration tests: /api/admin/categories ────────────────────

describe("GET /api/admin/categories (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(VALID_SESSION);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESULT);
    const { GET } = await import("@/app/api/admin/categories/route");
    const res = await GET();

    expect(res.status).toBe(401);
  });

  it("returns category list on success", async () => {
    const mockCategories = [
      { id: "cat-1", name: "Watches", slug: "watches", taxonomy_type: "general" },
      { id: "cat-2", name: "Budget", slug: "budget", taxonomy_type: "budget" },
    ];
    mockListCategories.mockResolvedValue(mockCategories);

    const { GET } = await import("@/app/api/admin/categories/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Watches");
  });
});

describe("POST /api/admin/categories (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(VALID_SESSION);
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireAdmin.mockResolvedValue(UNAUTH_RESULT);
    const { POST } = await import("@/app/api/admin/categories/route");
    const res = await POST(makeCategoryRequest("POST", { name: "Test", slug: "test" }));

    expect(res.status).toBe(401);
  });

  it("creates a category with valid input", async () => {
    const created = { id: "cat-new", name: "Luxury", slug: "luxury", taxonomy_type: "budget" };
    mockCreateCategory.mockResolvedValue(created);

    const { POST } = await import("@/app/api/admin/categories/route");
    const res = await POST(
      makeCategoryRequest("POST", {
        name: "Luxury",
        slug: "luxury",
        taxonomy_type: "budget",
      }),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Luxury");
    expect(mockCreateCategory).toHaveBeenCalledWith(
      expect.objectContaining({
        site_id: "site-uuid-123",
        name: "Luxury",
        slug: "luxury",
        taxonomy_type: "budget",
      }),
    );
  });

  it("returns 400 for missing name", async () => {
    const { POST } = await import("@/app/api/admin/categories/route");
    const res = await POST(makeCategoryRequest("POST", { slug: "test" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/validation/i);
    expect(body.details.name).toBeDefined();
  });

  it("returns 400 for invalid slug (uppercase)", async () => {
    const { POST } = await import("@/app/api/admin/categories/route");
    const res = await POST(makeCategoryRequest("POST", { name: "Test", slug: "UPPERCASE" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.slug).toBeDefined();
  });

  it("returns 400 for invalid taxonomy_type", async () => {
    const { POST } = await import("@/app/api/admin/categories/route");
    const res = await POST(
      makeCategoryRequest("POST", {
        name: "Test",
        slug: "test",
        taxonomy_type: "invalid",
      }),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.taxonomy_type).toBeDefined();
  });

  it("returns 400 for malformed JSON", async () => {
    const { POST } = await import("@/app/api/admin/categories/route");
    const req = new NextRequest("http://localhost:3000/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json{",
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/admin/categories (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(VALID_SESSION);
  });

  it("updates a category with valid input", async () => {
    const validId = "550e8400-e29b-41d4-a716-446655440000";
    const updated = { id: validId, name: "Updated", slug: "watches", taxonomy_type: "general" };
    mockUpdateCategory.mockResolvedValue(updated);

    const { PATCH } = await import("@/app/api/admin/categories/route");
    const res = await PATCH(makeCategoryRequest("PATCH", { id: validId, name: "Updated" }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated");
  });

  it("returns 400 for missing id", async () => {
    const { PATCH } = await import("@/app/api/admin/categories/route");
    const res = await PATCH(makeCategoryRequest("PATCH", { name: "No ID" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.id).toBeDefined();
  });

  it("returns 400 for non-UUID id", async () => {
    const { PATCH } = await import("@/app/api/admin/categories/route");
    const res = await PATCH(makeCategoryRequest("PATCH", { id: "not-uuid", name: "Test" }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details.id).toBeDefined();
  });
});

describe("DELETE /api/admin/categories (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(VALID_SESSION);
  });

  it("deletes a category by id in body", async () => {
    const validId = "550e8400-e29b-41d4-a716-446655440000";
    mockDeleteCategory.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/admin/categories/route");
    const res = await DELETE(makeCategoryRequest("DELETE", { id: validId }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockDeleteCategory).toHaveBeenCalledWith("site-uuid-123", validId);
  });

  it("returns 400 when id is missing", async () => {
    const { DELETE } = await import("@/app/api/admin/categories/route");
    const req = new NextRequest("http://localhost:3000/api/admin/categories", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await DELETE(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/id/i);
  });
});
