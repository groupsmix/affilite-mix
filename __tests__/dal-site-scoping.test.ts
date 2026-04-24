/**
 * Multi-tenant site-scoping guarantees for every DAL function that reads,
 * updates, or deletes rows in a tenant-scoped table.
 *
 * A cross-tenant query (one that forgets `site_id`) is a security
 * regression — it would let one site read/mutate another site's data,
 * even with RLS acting as defence-in-depth (service role bypasses RLS).
 *
 * These tests mock `@/lib/supabase-server` with a recording proxy that
 * captures every chain method call, then assert that:
 *
 *   - SELECT / UPDATE / DELETE queries always include `.eq("site_id", <id>)`
 *   - INSERT payloads always include a `site_id` property
 *
 * The tests are intentionally mechanical — if a new DAL function is
 * added without site scoping, the build breaks.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Recording Supabase client ────────────────────────────────────

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface Recorder {
  calls: RecordedCall[];
  result: { data: unknown; error: unknown; count: number | null };
}

function createSupabaseRecorder(
  result: { data?: unknown; error?: unknown; count?: number | null } = {},
): { client: unknown; recorder: Recorder } {
  const recorder: Recorder = {
    calls: [],
    result: {
      data: result.data ?? { id: "row-1" },
      error: result.error ?? null,
      count: result.count ?? 0,
    },
  };

  // The chain is a Proxy that records every property access as a call,
  // returns itself on every method invocation, and is thenable so that
  // any `await sb.from(...).select()...` resolves to the configured result.
  const chain: unknown = new Proxy(function noop() {}, {
    get(_target, prop: string | symbol) {
      if (prop === "then") {
        return (resolve: (v: unknown) => void) => resolve(recorder.result);
      }
      if (typeof prop === "symbol") return undefined;
      return (...args: unknown[]) => {
        recorder.calls.push({ method: prop, args });
        return chain;
      };
    },
  });

  return { client: chain, recorder };
}

// Hoisted shared recorder so vi.mock factories can access it.
const sharedState: { current: Recorder | null } = { current: null };

vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: () => {
    const { client, recorder } = createSupabaseRecorder();
    sharedState.current = recorder;
    return client;
  },
  getAnonClient: () => {
    const { client, recorder } = createSupabaseRecorder();
    sharedState.current = recorder;
    return client;
  },
}));

// Stubs for things DAL functions don't need during site-scoping checks.
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

// ── Assertions ───────────────────────────────────────────────────

const TEST_SITE_ID = "site-uuid-under-test";
const OTHER_ID = "entity-id-under-test";

function lastRecorder(): Recorder {
  const r = sharedState.current;
  if (!r) throw new Error("No Supabase recorder captured — did the DAL call get*Client()?");
  return r;
}

/** Assert the recorded chain filtered by `site_id = TEST_SITE_ID`. */
function expectScopedBySiteId(recorder: Recorder): void {
  const scopedCalls = recorder.calls.filter(
    (c) =>
      c.method === "eq" &&
      c.args.length >= 2 &&
      c.args[0] === "site_id" &&
      c.args[1] === TEST_SITE_ID,
  );
  expect(
    scopedCalls.length,
    `expected .eq("site_id", "${TEST_SITE_ID}") — actual chain: ${JSON.stringify(recorder.calls)}`,
  ).toBeGreaterThanOrEqual(1);
}

/** Assert the recorded chain is an INSERT whose payload includes `site_id`. */
function expectInsertContainsSiteId(recorder: Recorder): void {
  const insert = recorder.calls.find((c) => c.method === "insert");
  expect(insert, "expected an insert() call").toBeDefined();
  const payload = insert!.args[0];
  if (Array.isArray(payload)) {
    for (const row of payload) {
      expect(row).toHaveProperty("site_id");
    }
  } else {
    expect(payload).toHaveProperty("site_id");
  }
}

beforeEach(() => {
  sharedState.current = null;
  // Ensure the DAL "is configured" branch is taken so guards that early-return
  // on placeholder URLs do not skip the query under test.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

// ── Content DAL ──────────────────────────────────────────────────

describe("lib/dal/content — every query is site-scoped", () => {
  it("listContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({ siteId: TEST_SITE_ID });
    expectScopedBySiteId(lastRecorder());
  });

  it("getContentById", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.getContentById(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("getContentBySlug (published)", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.getContentBySlug(TEST_SITE_ID, "some-slug");
    expectScopedBySiteId(lastRecorder());
  });

  it("getContentBySlug (preview)", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.getContentBySlug(TEST_SITE_ID, "some-slug", true);
    expectScopedBySiteId(lastRecorder());
  });

  it("createContent requires site_id in payload", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.createContent({
      site_id: TEST_SITE_ID,
      title: "t",
      slug: "s",
      excerpt: "",
      body: "",
      featured_image: "",
      type: "article",
      status: "draft",
      category_id: null,
      tags: [],
      author: "a",
      publish_at: null,
      meta_title: "",
      meta_description: "",
      og_image: "",
      body_previous: "",
      review_state: "draft",
      image_alt: "",
    } as Parameters<typeof mod.createContent>[0]);
    expectInsertContainsSiteId(lastRecorder());
  });

  it("updateContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.updateContent(TEST_SITE_ID, OTHER_ID, { title: "new" });
    expectScopedBySiteId(lastRecorder());
  });

  it("deleteContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.deleteContent(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("countContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.countContent({ siteId: TEST_SITE_ID });
    expectScopedBySiteId(lastRecorder());
  });

  it("listPublishedContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listPublishedContent(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("countPublishedContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.countPublishedContent(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("searchContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.searchContent(TEST_SITE_ID, "hello");
    expectScopedBySiteId(lastRecorder());
  });

  it("getRelatedContent", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.getRelatedContent(TEST_SITE_ID, null, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });
});

// ── Products DAL ─────────────────────────────────────────────────

describe("lib/dal/products — every query is site-scoped", () => {
  it("listProducts", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.listProducts({ siteId: TEST_SITE_ID });
    expectScopedBySiteId(lastRecorder());
  });

  it("countProducts", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.countProducts({ siteId: TEST_SITE_ID });
    expectScopedBySiteId(lastRecorder());
  });

  it("getProductById", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.getProductById(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("getProductBySlug", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.getProductBySlug(TEST_SITE_ID, "slug");
    expectScopedBySiteId(lastRecorder());
  });

  it("updateProduct", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.updateProduct(TEST_SITE_ID, OTHER_ID, { name: "n" });
    expectScopedBySiteId(lastRecorder());
  });

  it("deleteProduct", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.deleteProduct(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("listActiveProducts", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.listActiveProducts(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("searchProducts", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.searchProducts(TEST_SITE_ID, "query");
    expectScopedBySiteId(lastRecorder());
  });

  it("listFeaturedProducts", async () => {
    const mod = await import("@/lib/dal/products");
    await mod.listFeaturedProducts(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });
});

// ── Categories DAL ───────────────────────────────────────────────

describe("lib/dal/categories — every query is site-scoped", () => {
  it("listCategories", async () => {
    const mod = await import("@/lib/dal/categories");
    await mod.listCategories(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("listCategoriesByTaxonomy", async () => {
    const mod = await import("@/lib/dal/categories");
    await mod.listCategoriesByTaxonomy(TEST_SITE_ID, "general");
    expectScopedBySiteId(lastRecorder());
  });

  it("getCategoryById", async () => {
    const mod = await import("@/lib/dal/categories");
    await mod.getCategoryById(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("getCategoryBySlug", async () => {
    const mod = await import("@/lib/dal/categories");
    await mod.getCategoryBySlug(TEST_SITE_ID, "slug");
    expectScopedBySiteId(lastRecorder());
  });

  it("updateCategory", async () => {
    const mod = await import("@/lib/dal/categories");
    await mod.updateCategory(TEST_SITE_ID, OTHER_ID, { name: "n" });
    expectScopedBySiteId(lastRecorder());
  });

  it("deleteCategory", async () => {
    const mod = await import("@/lib/dal/categories");
    await mod.deleteCategory(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });
});

// ── Affiliate clicks DAL ─────────────────────────────────────────

describe("lib/dal/affiliate-clicks — every analytics query is site-scoped", () => {
  it("getClickCount", async () => {
    const mod = await import("@/lib/dal/affiliate-clicks");
    await mod.getClickCount(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("getRecentClicks", async () => {
    const mod = await import("@/lib/dal/affiliate-clicks");
    await mod.getRecentClicks(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("recordClick insert payload includes site_id", async () => {
    const mod = await import("@/lib/dal/affiliate-clicks");
    await mod.recordClick({
      site_id: TEST_SITE_ID,
      product_name: "p",
      affiliate_url: "https://example.com",
    });
    expectInsertContainsSiteId(lastRecorder());
  });
});

// ── Audit log DAL ────────────────────────────────────────────────

describe("lib/dal/audit-log — every query is site-scoped", () => {
  it("listAuditLogs", async () => {
    const mod = await import("@/lib/dal/audit-log");
    await mod.listAuditLogs(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("getDistinctActions", async () => {
    const mod = await import("@/lib/dal/audit-log");
    await mod.getDistinctActions(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });
});

// ── Ad placements DAL ────────────────────────────────────────────

describe("lib/dal/ad-placements — every query is site-scoped", () => {
  it("listAdPlacements", async () => {
    const mod = await import("@/lib/dal/ad-placements");
    await mod.listAdPlacements(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("listActiveAdPlacements", async () => {
    const mod = await import("@/lib/dal/ad-placements");
    await mod.listActiveAdPlacements(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("getAdPlacementById", async () => {
    const mod = await import("@/lib/dal/ad-placements");
    await mod.getAdPlacementById(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("updateAdPlacement", async () => {
    const mod = await import("@/lib/dal/ad-placements");
    await mod.updateAdPlacement(TEST_SITE_ID, OTHER_ID, { name: "n" });
    expectScopedBySiteId(lastRecorder());
  });

  it("deleteAdPlacement", async () => {
    const mod = await import("@/lib/dal/ad-placements");
    await mod.deleteAdPlacement(TEST_SITE_ID, OTHER_ID);
    expectScopedBySiteId(lastRecorder());
  });
});

// ── Pages DAL ────────────────────────────────────────────────────

describe("lib/dal/pages — site-scoped read queries", () => {
  it("listPages", async () => {
    const mod = await import("@/lib/dal/pages");
    await mod.listPages(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("listPublishedPages", async () => {
    const mod = await import("@/lib/dal/pages");
    await mod.listPublishedPages(TEST_SITE_ID);
    expectScopedBySiteId(lastRecorder());
  });

  it("getPageBySlug", async () => {
    const mod = await import("@/lib/dal/pages");
    await mod.getPageBySlug(TEST_SITE_ID, "about");
    expectScopedBySiteId(lastRecorder());
  });
});
