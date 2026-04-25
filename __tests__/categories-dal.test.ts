/**
 * Tests for the 12a DAL extensions on `lib/dal/categories`:
 *
 *   - `listCategories(siteId, { q })` — optional case-insensitive name filter
 *     applied as `.ilike("name", "%<escaped>%")`. Empty / whitespace `q` must
 *     not add any filter at all. Return shape is unchanged.
 *   - `getCategoryUsageCountsBatch(siteId, ids)` — O(1)-round-trip batch
 *     count of referencing rows in `content` and `products`.
 *
 * These tests reuse the "recording Supabase client" pattern from
 * `dal-site-scoping.test.ts`: a Proxy captures every chain method call so we
 * can assert the exact query shape without hitting a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Recording Supabase client ────────────────────────────────────

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface FromSession {
  table: string;
  calls: RecordedCall[];
  result: { data: unknown; error: unknown };
}

interface Recorder {
  sessions: FromSession[];
}

function createSupabaseRecorder(resultFor: (table: string) => { data: unknown; error?: unknown }): {
  client: unknown;
  recorder: Recorder;
} {
  const recorder: Recorder = { sessions: [] };

  const makeChain = (session: FromSession): unknown =>
    new Proxy(function noop() {}, {
      get(_target, prop: string | symbol) {
        if (prop === "then") {
          return (resolve: (v: unknown) => void) =>
            resolve({ data: session.result.data, error: session.result.error });
        }
        if (typeof prop === "symbol") return undefined;
        return (...args: unknown[]) => {
          session.calls.push({ method: prop as string, args });
          return makeChain(session);
        };
      },
    });

  const client = {
    from(table: string) {
      const r = resultFor(table);
      const session: FromSession = {
        table,
        calls: [{ method: "from", args: [table] }],
        result: { data: r.data, error: r.error ?? null },
      };
      recorder.sessions.push(session);
      return makeChain(session);
    },
  };

  return { client, recorder };
}

const sharedState: {
  recorder: Recorder | null;
  resultFor: ((table: string) => { data: unknown; error?: unknown }) | null;
} = {
  recorder: null,
  resultFor: null,
};

vi.mock("@/lib/supabase-server", () => ({
  getAnonClient: () => {
    const resultFor = sharedState.resultFor ?? (() => ({ data: [] }));
    const { client, recorder } = createSupabaseRecorder(resultFor);
    sharedState.recorder = recorder;
    return client;
  },
  getServiceClient: () => {
    const resultFor = sharedState.resultFor ?? (() => ({ data: [] }));
    const { client, recorder } = createSupabaseRecorder(resultFor);
    sharedState.recorder = recorder;
    return client;
  },
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const TEST_SITE_ID = "site-under-test";

function getSessions(table?: string): FromSession[] {
  const r = sharedState.recorder;
  if (!r) throw new Error("No Supabase recorder captured");
  return table ? r.sessions.filter((s) => s.table === table) : r.sessions;
}

beforeEach(() => {
  sharedState.recorder = null;
  sharedState.resultFor = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

// ── buildCategoryNameIlikePattern ────────────────────────────────

describe("buildCategoryNameIlikePattern", () => {
  it("returns null for undefined, empty, and whitespace-only input", async () => {
    const { buildCategoryNameIlikePattern } = await import("@/lib/dal/categories");
    expect(buildCategoryNameIlikePattern(undefined)).toBeNull();
    expect(buildCategoryNameIlikePattern("")).toBeNull();
    expect(buildCategoryNameIlikePattern("   ")).toBeNull();
    expect(buildCategoryNameIlikePattern("\t\n ")).toBeNull();
  });

  it("trims and wraps plain input in % wildcards", async () => {
    const { buildCategoryNameIlikePattern } = await import("@/lib/dal/categories");
    expect(buildCategoryNameIlikePattern("gifts")).toBe("%gifts%");
    expect(buildCategoryNameIlikePattern("  ideas  ")).toBe("%ideas%");
  });

  it("escapes ILIKE wildcard metacharacters in user input", async () => {
    const { buildCategoryNameIlikePattern } = await import("@/lib/dal/categories");
    expect(buildCategoryNameIlikePattern("50%")).toBe("%50\\%%");
    expect(buildCategoryNameIlikePattern("a_b")).toBe("%a\\_b%");
    expect(buildCategoryNameIlikePattern("a\\b")).toBe("%a\\\\b%");
    expect(buildCategoryNameIlikePattern("%_\\")).toBe("%\\%\\_\\\\%");
  });
});

// ── listCategories(q) ────────────────────────────────────────────

describe("listCategories — q option", () => {
  it("does not add an ilike filter when q is omitted", async () => {
    sharedState.resultFor = () => ({ data: [] });
    const mod = await import("@/lib/dal/categories");
    await mod.listCategories(TEST_SITE_ID);

    const [session] = getSessions("categories");
    expect(session).toBeDefined();
    const ilike = session.calls.find((c) => c.method === "ilike");
    expect(ilike).toBeUndefined();
  });

  it("does not add an ilike filter when q is empty / whitespace", async () => {
    sharedState.resultFor = () => ({ data: [] });
    const mod = await import("@/lib/dal/categories");
    await mod.listCategories(TEST_SITE_ID, { q: "" });
    await mod.listCategories(TEST_SITE_ID, { q: "   " });

    for (const session of getSessions("categories")) {
      const ilike = session.calls.find((c) => c.method === "ilike");
      expect(ilike).toBeUndefined();
    }
  });

  it("adds .ilike('name', '%<escaped>%') when q is provided", async () => {
    sharedState.resultFor = () => ({ data: [] });
    const mod = await import("@/lib/dal/categories");
    await mod.listCategories(TEST_SITE_ID, { q: "  Gifts " });

    const [session] = getSessions("categories");
    expect(session).toBeDefined();
    const ilike = session.calls.find((c) => c.method === "ilike");
    expect(ilike).toBeDefined();
    expect(ilike!.args).toEqual(["name", "%Gifts%"]);
  });

  it("escapes %, _ and backslash in q before issuing ilike", async () => {
    sharedState.resultFor = () => ({ data: [] });
    const mod = await import("@/lib/dal/categories");
    await mod.listCategories(TEST_SITE_ID, { q: "50%_off" });

    const [session] = getSessions("categories");
    const ilike = session.calls.find((c) => c.method === "ilike");
    expect(ilike!.args).toEqual(["name", "%50\\%\\_off%"]);
  });

  it("always scopes by site_id and orders by name (preserves existing shape)", async () => {
    sharedState.resultFor = () => ({ data: [] });
    const mod = await import("@/lib/dal/categories");
    await mod.listCategories(TEST_SITE_ID, { q: "x" });

    const [session] = getSessions("categories");
    const eq = session.calls.find((c) => c.method === "eq");
    const order = session.calls.find((c) => c.method === "order");
    expect(eq?.args).toEqual(["site_id", TEST_SITE_ID]);
    expect(order?.args[0]).toBe("name");
    expect(order?.args[1]).toMatchObject({ ascending: true });
  });

  it("normalizes rows and preserves return shape regardless of q", async () => {
    sharedState.resultFor = () => ({
      data: [
        {
          id: "c1",
          site_id: TEST_SITE_ID,
          name: "Gifts",
          slug: "gifts",
          description: "d",
          taxonomy_type: "general",
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });
    const mod = await import("@/lib/dal/categories");
    const rows = await mod.listCategories(TEST_SITE_ID, { q: "gif" });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "c1",
      site_id: TEST_SITE_ID,
      name: "Gifts",
      slug: "gifts",
      description: "d",
      taxonomy_type: "general",
      created_at: "2024-01-01T00:00:00Z",
    });
  });
});

// ── getCategoryUsageCountsBatch ──────────────────────────────────

describe("getCategoryUsageCountsBatch", () => {
  it("returns zero-filled maps with no queries when ids is empty", async () => {
    sharedState.resultFor = () => ({ data: [] });
    const mod = await import("@/lib/dal/categories");
    const result = await mod.getCategoryUsageCountsBatch(TEST_SITE_ID, []);

    expect(result.contentCounts.size).toBe(0);
    expect(result.productCounts.size).toBe(0);
    expect(sharedState.recorder).toBeNull();
  });

  it("de-duplicates and filters falsy ids, and zero-fills each unique id", async () => {
    sharedState.resultFor = (table) => {
      if (table === "content") return { data: [{ category_id: "a" }] };
      if (table === "products") return { data: [] };
      return { data: [] };
    };
    const mod = await import("@/lib/dal/categories");
    const result = await mod.getCategoryUsageCountsBatch(TEST_SITE_ID, ["a", "b", "a", "", "c"]);

    expect([...result.contentCounts.entries()].sort()).toEqual([
      ["a", 1],
      ["b", 0],
      ["c", 0],
    ]);
    expect([...result.productCounts.entries()].sort()).toEqual([
      ["a", 0],
      ["b", 0],
      ["c", 0],
    ]);

    // One query per referencing table — O(1) round trips.
    const sessions = getSessions();
    expect(sessions.filter((s) => s.table === "content")).toHaveLength(1);
    expect(sessions.filter((s) => s.table === "products")).toHaveLength(1);
  });

  it("issues .in('category_id', <uniqueIds>) scoped by site_id for each table", async () => {
    sharedState.resultFor = () => ({ data: [] });
    const mod = await import("@/lib/dal/categories");
    await mod.getCategoryUsageCountsBatch(TEST_SITE_ID, ["a", "b"]);

    for (const table of ["content", "products"]) {
      const [session] = getSessions(table);
      expect(session, `missing ${table} query`).toBeDefined();
      const eqSite = session.calls.find(
        (c) => c.method === "eq" && c.args[0] === "site_id" && c.args[1] === TEST_SITE_ID,
      );
      const inCall = session.calls.find((c) => c.method === "in");
      expect(eqSite, `${table} must be site-scoped`).toBeDefined();
      expect(inCall?.args[0]).toBe("category_id");
      expect(inCall?.args[1]).toEqual(["a", "b"]);
    }
  });

  it("groups and counts matching rows per category across both tables", async () => {
    sharedState.resultFor = (table) => {
      if (table === "content") {
        return {
          data: [
            { category_id: "a" },
            { category_id: "a" },
            { category_id: "b" },
            { category_id: "zzz-not-in-ids" }, // defensive: ignored
            { unrelated: "row" }, // defensive: ignored
          ],
        };
      }
      if (table === "products") {
        return {
          data: [
            { category_id: "a" },
            { category_id: "c" },
            { category_id: "c" },
            { category_id: "c" },
          ],
        };
      }
      return { data: [] };
    };
    const mod = await import("@/lib/dal/categories");
    const result = await mod.getCategoryUsageCountsBatch(TEST_SITE_ID, ["a", "b", "c"]);

    expect(result.contentCounts.get("a")).toBe(2);
    expect(result.contentCounts.get("b")).toBe(1);
    expect(result.contentCounts.get("c")).toBe(0);
    expect(result.productCounts.get("a")).toBe(1);
    expect(result.productCounts.get("b")).toBe(0);
    expect(result.productCounts.get("c")).toBe(3);
  });

  it("treats per-table errors as zero counts (never throws)", async () => {
    sharedState.resultFor = (table) => {
      if (table === "content") return { data: null, error: { message: "boom" } };
      if (table === "products") return { data: [{ category_id: "a" }] };
      return { data: [] };
    };
    const mod = await import("@/lib/dal/categories");
    const result = await mod.getCategoryUsageCountsBatch(TEST_SITE_ID, ["a"]);

    expect(result.contentCounts.get("a")).toBe(0);
    expect(result.productCounts.get("a")).toBe(1);
  });

  it("returns zero-filled maps when Supabase is not configured (placeholder URL)", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://placeholder.supabase.co";
    const mod = await import("@/lib/dal/categories");
    const result = await mod.getCategoryUsageCountsBatch(TEST_SITE_ID, ["a", "b"]);

    expect(result.contentCounts.get("a")).toBe(0);
    expect(result.contentCounts.get("b")).toBe(0);
    expect(result.productCounts.get("a")).toBe(0);
    expect(result.productCounts.get("b")).toBe(0);
    expect(sharedState.recorder).toBeNull();
  });
});
