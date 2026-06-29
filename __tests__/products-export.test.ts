/**
 * Bug 7 — GET /api/admin/products/export must export the ENTIRE catalogue.
 *
 * Previously the route called `listProducts({ siteId })` with no `limit`, which
 * `clampPagination` silently clamped to DEFAULT_LIMIT (20), so "export all"
 * emitted at most 20 rows. The route now pages through every product using the
 * DAL's maximum page size.
 *
 * These tests drive the real route handler through the real `withAuthz` wrapper
 * (with `admin-guard` + `permissions` mocked to grant access) against a
 * paginated fake of the products DAL that mirrors the production
 * `clampPagination` behaviour, then assert the CSV body contains every product.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { clampPagination, MAX_LIMIT } from "@/lib/dal/pagination-guard";
import type { ProductRow } from "@/types/database";

const TEST_SITE_ID = "site-uuid-123";
const TEST_SITE_SLUG = "test-site";

interface ListProductsArgs {
  siteId: string;
  limit?: number;
  offset?: number;
}

// ── Mocks ────────────────────────────────────────────────────────

// Authenticated admin session so the real withAuthz wrapper admits the call.
const mockRequireAdmin = vi.fn();
vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  requireSuperAdmin: (...args: unknown[]) => mockRequireAdmin(...args),
  assertRole: vi.fn().mockReturnValue(null),
}));

// withAuthz() calls hasPermission() before invoking the handler.
vi.mock("@/lib/dal/permissions", () => ({
  hasPermission: vi.fn().mockResolvedValue(true),
}));

// The rate limiter must not short-circuit the request (null = allowed).
const mockEnforceAdminRateLimit = vi.fn();
vi.mock("@/lib/admin-rate-limit", () => ({
  enforceAdminRateLimit: (...args: unknown[]) => mockEnforceAdminRateLimit(...args),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

const mockLoggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: (...args: unknown[]) => mockLoggerWarn(...args),
    error: vi.fn(),
    child: vi.fn(),
  },
}));

// Paginated fake of the products DAL. It applies the SAME clampPagination the
// real DAL uses, so a regression back to a bare `listProducts({ siteId })`
// (limit clamped to 20) is faithfully reproduced and caught by these tests.
let catalog: ProductRow[] = [];
const mockListProducts = vi.fn(async (opts: ListProductsArgs): Promise<ProductRow[]> => {
  const { limit, offset } = clampPagination(opts);
  return catalog.slice(offset, offset + limit);
});
vi.mock("@/lib/dal/products", () => ({
  listProducts: (opts: ListProductsArgs) => mockListProducts(opts),
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeCatalog(n: number): ProductRow[] {
  return Array.from(
    { length: n },
    (_, i): ProductRow => ({
      id: `prod-${i}`,
      site_id: TEST_SITE_ID,
      name: `Product ${i}`,
      slug: `product-${i}`,
      description: `Description ${i}`,
      affiliate_url: `https://example.com/p/${i}`,
      image_url: `https://cdn.example.com/${i}.jpg`,
      image_alt: `Image ${i}`,
      price: `${i}.00`,
      price_amount: i,
      price_currency: "USD",
      merchant: `Merchant ${i}`,
      score: i,
      featured: false,
      status: "active",
      category_id: null,
      cta_text: "Buy now",
      deal_text: "",
      deal_expires_at: null,
      pros: "",
      cons: "",
      version: 1,
      created_at: "2024-01-01T00:00:00.000Z",
      updated_at: "2024-01-01T00:00:00.000Z",
    }),
  );
}

function makeExportRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/admin/products/export", {
    method: "GET",
  });
}

async function invokeExport() {
  const { GET } = await import("@/app/api/admin/products/export/route");
  return GET(makeExportRequest());
}

/** Split a CSV body into its header line and data lines. */
function parseCsv(body: string): { header: string; dataLines: string[] } {
  const lines = body.split("\n");
  return { header: lines[0] ?? "", dataLines: lines.slice(1) };
}

function calledOffsets(): (number | undefined)[] {
  return mockListProducts.mock.calls.map((call) => call[0].offset);
}

// ── Tests ────────────────────────────────────────────────────────

describe("GET /api/admin/products/export — Bug 7 (export all products)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog = [];
    mockRequireAdmin.mockResolvedValue({
      error: null,
      session: { email: "admin@test.com", userId: "user-1", role: "admin" },
      dbSiteId: TEST_SITE_ID,
      siteSlug: TEST_SITE_SLUG,
    });
    mockEnforceAdminRateLimit.mockResolvedValue(null);
  });

  it("exports more than the default page size (regression: was capped at 20)", async () => {
    catalog = makeCatalog(45);

    const res = await invokeExport();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");

    const { dataLines } = parseCsv(await res.text());
    expect(dataLines).toHaveLength(45);
  }, 30000);

  it("includes the first and last product, not just the first page", async () => {
    catalog = makeCatalog(45);

    const body = await (await invokeExport()).text();

    expect(body).toContain("product-0");
    expect(body).toContain("product-44");
  }, 30000);

  it("pages through the whole catalogue across multiple DAL calls", async () => {
    catalog = makeCatalog(450); // 200 + 200 + 50

    const { dataLines } = parseCsv(await (await invokeExport()).text());
    expect(dataLines).toHaveLength(450);

    // Three pages at offsets 0, 200, 400 — each at the DAL's max page size.
    expect(mockListProducts).toHaveBeenCalledTimes(3);
    expect(calledOffsets()).toEqual([0, 200, 400]);
    for (const call of mockListProducts.mock.calls) {
      expect(call[0].limit).toBe(MAX_LIMIT);
    }
    // A 450-row catalogue is nowhere near the cap, so no truncation warning.
    expect(mockLoggerWarn).not.toHaveBeenCalled();
  }, 30000);

  it("terminates cleanly when the total is an exact multiple of the page size", async () => {
    catalog = makeCatalog(400); // 200 + 200, then an empty trailing page

    const { dataLines } = parseCsv(await (await invokeExport()).text());

    expect(dataLines).toHaveLength(400);
    // One extra empty fetch detects the end: offsets 0, 200, 400.
    expect(calledOffsets()).toEqual([0, 200, 400]);
  }, 30000);

  it("returns only the header row for an empty catalogue", async () => {
    catalog = makeCatalog(0);

    const { header, dataLines } = parseCsv(await (await invokeExport()).text());

    expect(header.split(",")[0]).toBe("name");
    expect(dataLines).toHaveLength(0);
    expect(mockListProducts).toHaveBeenCalledTimes(1);
  }, 30000);
});
