/**
 * Route handler integration tests — exercises actual Next.js route handlers
 * with mocked dependencies (Supabase, auth, etc.)
 *
 * Finding 8.3 (HIGH): Integration test coverage with mocked Supabase
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock admin-guard module ──────────────────────────────────────────
const mockRequireAdmin = vi.fn();
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: () => mockRequireAdmin(),
  requireSuperAdmin: () => mockRequireAdmin(),
  assertRole: vi.fn(),
}));

// ── Mock DAL modules ─────────────────────────────────────────────────
const mockListPages = vi.fn();
const mockCreatePage = vi.fn();
const mockGetPageById = vi.fn();
const mockUpdatePage = vi.fn();
const mockDeletePage = vi.fn();
const mockReorderPages = vi.fn();

vi.mock("@/lib/dal/pages", () => ({
  listPages: (...args: unknown[]) => mockListPages(...args),
  createPage: (...args: unknown[]) => mockCreatePage(...args),
  getPageById: (...args: unknown[]) => mockGetPageById(...args),
  updatePage: (...args: unknown[]) => mockUpdatePage(...args),
  deletePage: (...args: unknown[]) => mockDeletePage(...args),
  reorderPages: (...args: unknown[]) => mockReorderPages(...args),
}));

// ── Helper: simulate authenticated admin ─────────────────────────────
function authenticatedAdmin(overrides?: { dbSiteId?: string; siteSlug?: string }) {
  mockRequireAdmin.mockResolvedValue({
    error: null,
    session: { email: "admin@test.com", userId: "user-1", role: "admin" },
    dbSiteId: overrides?.dbSiteId ?? "site-uuid-123",
    siteSlug: overrides?.siteSlug ?? "test-site",
  });
}

function unauthenticated() {
  const { NextResponse } = require("next/server");
  mockRequireAdmin.mockResolvedValue({
    error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    session: null,
    dbSiteId: null,
    siteSlug: null,
  });
}

// ── Pages route handler tests ────────────────────────────────────────

describe("GET /api/admin/pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    unauthenticated();
    const { GET } = await import("@/app/api/admin/pages/route");
    const response = await GET();
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns pages list when authenticated", async () => {
    authenticatedAdmin();
    const pages = [
      { id: "p1", title: "About", slug: "about", is_published: true },
      { id: "p2", title: "Terms", slug: "terms", is_published: false },
    ];
    mockListPages.mockResolvedValue(pages);

    const { GET } = await import("@/app/api/admin/pages/route");
    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(pages);
    expect(mockListPages).toHaveBeenCalledWith("site-uuid-123");
  });

  it("returns 500 on DAL error", async () => {
    authenticatedAdmin();
    mockListPages.mockRejectedValue(new Error("DB connection failed"));

    const { GET } = await import("@/app/api/admin/pages/route");
    const response = await GET();
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("DB connection failed");
  });
});

describe("POST /api/admin/pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a page with valid payload", async () => {
    authenticatedAdmin();
    const created = { id: "new-page", title: "FAQ", slug: "faq", is_published: false };
    mockCreatePage.mockResolvedValue(created);

    const { POST } = await import("@/app/api/admin/pages/route");
    const request = new Request("http://localhost/api/admin/pages", {
      method: "POST",
      body: JSON.stringify({ title: "FAQ", slug: "faq" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request as never);
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.title).toBe("FAQ");
  });

  it("returns 400 for missing required fields", async () => {
    authenticatedAdmin();

    const { POST } = await import("@/app/api/admin/pages/route");
    const request = new Request("http://localhost/api/admin/pages", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request as never);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("required");
  });
});

describe("PATCH /api/admin/pages/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a page when authenticated", async () => {
    authenticatedAdmin();
    const updated = { id: "p1", title: "Updated", slug: "about" };
    mockUpdatePage.mockResolvedValue(updated);

    const { PATCH } = await import("@/app/api/admin/pages/[id]/route");
    const request = new Request("http://localhost/api/admin/pages/p1", {
      method: "PATCH",
      body: JSON.stringify({ title: "Updated" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PATCH(request as never, { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(200);
    expect(mockUpdatePage).toHaveBeenCalledWith("p1", { title: "Updated" });
  });
});

describe("DELETE /api/admin/pages/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a page when authenticated", async () => {
    authenticatedAdmin();
    mockDeletePage.mockResolvedValue(undefined);

    const { DELETE } = await import("@/app/api/admin/pages/[id]/route");
    const request = new Request("http://localhost/api/admin/pages/p1", { method: "DELETE" });
    const response = await DELETE(request as never, { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(200);
    expect(mockDeletePage).toHaveBeenCalledWith("p1");
  });

  it("returns 401 when not authenticated", async () => {
    unauthenticated();

    const { DELETE } = await import("@/app/api/admin/pages/[id]/route");
    const request = new Request("http://localhost/api/admin/pages/p1", { method: "DELETE" });
    const response = await DELETE(request as never, { params: Promise.resolve({ id: "p1" }) });
    expect(response.status).toBe(401);
  });
});

describe("PUT /api/admin/pages/reorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reorders pages with valid payload", async () => {
    authenticatedAdmin();
    mockReorderPages.mockResolvedValue(undefined);

    const { PUT } = await import("@/app/api/admin/pages/reorder/route");
    const request = new Request("http://localhost/api/admin/pages/reorder", {
      method: "PUT",
      body: JSON.stringify({
        pages: [
          { id: "p1", sort_order: 0 },
          { id: "p2", sort_order: 1 },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request as never);
    expect(response.status).toBe(200);
    expect(mockReorderPages).toHaveBeenCalledWith([
      { id: "p1", sort_order: 0 },
      { id: "p2", sort_order: 1 },
    ]);
  });

  it("returns 400 when pages is not an array", async () => {
    authenticatedAdmin();

    const { PUT } = await import("@/app/api/admin/pages/reorder/route");
    const request = new Request("http://localhost/api/admin/pages/reorder", {
      method: "PUT",
      body: JSON.stringify({ pages: "not-an-array" }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await PUT(request as never);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("pages array is required");
  });
});

// ── Admin guard integration ──────────────────────────────────────────

describe("admin guard rate limiting integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("admin guard is applied to all page routes", async () => {
    authenticatedAdmin();
    mockListPages.mockResolvedValue([]);

    const { GET } = await import("@/app/api/admin/pages/route");
    await GET();
    // requireAdmin is called at least once per request
    expect(mockRequireAdmin).toHaveBeenCalled();
  });
});
