/**
 * Unit tests for the optional `q`, `types`, `statuses`, and sort params added
 * to `listContent` / `countContent` as part of the admin Content DataTable
 * migration.
 *
 * Uses the same recording-proxy pattern as `dal-site-scoping.test.ts` so the
 * assertions check the actual Supabase chain produced by the DAL without
 * needing a real database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface RecordedCall {
  method: string;
  args: unknown[];
}

interface Recorder {
  calls: RecordedCall[];
  result: { data: unknown; error: unknown; count: number | null };
}

function createSupabaseRecorder(): { client: unknown; recorder: Recorder } {
  const recorder: Recorder = {
    calls: [],
    result: { data: [], error: null, count: 0 },
  };

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

const sharedState: { current: Recorder | null } = { current: null };

vi.mock("@/lib/supabase-server", () => ({
  getServiceClient: () => {
    const { client, recorder } = createSupabaseRecorder();
    sharedState.current = recorder;
    return client;
  },
}));

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

const SITE_ID = "test-site-id";

function lastRecorder(): Recorder {
  const r = sharedState.current;
  if (!r) throw new Error("No Supabase recorder captured");
  return r;
}

function callsOf(recorder: Recorder, method: string): RecordedCall[] {
  return recorder.calls.filter((c) => c.method === method);
}

beforeEach(() => {
  sharedState.current = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
});

describe("listContent — new filter parameters", () => {
  it("applies .ilike('title', ...) when q is provided", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({ siteId: SITE_ID, q: "hello" });
    const ilikeCalls = callsOf(lastRecorder(), "ilike");
    expect(ilikeCalls).toHaveLength(1);
    expect(ilikeCalls[0]!.args[0]).toBe("title");
    expect(ilikeCalls[0]!.args[1]).toBe("%hello%");
  });

  it("ignores empty/whitespace q", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({ siteId: SITE_ID, q: "   " });
    expect(callsOf(lastRecorder(), "ilike")).toHaveLength(0);
  });

  it("escapes LIKE metacharacters in q to prevent wildcard injection", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({ siteId: SITE_ID, q: "50%_off" });
    const ilikeCalls = callsOf(lastRecorder(), "ilike");
    expect(ilikeCalls[0]!.args[1]).toBe("%50\\%\\_off%");
  });

  it("uses .in('type', types) when types[] is provided", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({
      siteId: SITE_ID,
      types: ["article", "review"],
    });
    const inCalls = callsOf(lastRecorder(), "in");
    const typeInCall = inCalls.find((c) => c.args[0] === "type");
    expect(typeInCall).toBeDefined();
    expect(typeInCall!.args[1]).toEqual(["article", "review"]);
  });

  it("falls back to .eq('type', contentType) when only contentType is set", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({ siteId: SITE_ID, contentType: "article" });
    const typeEq = callsOf(lastRecorder(), "eq").find((c) => c.args[0] === "type");
    expect(typeEq).toBeDefined();
    expect(typeEq!.args[1]).toBe("article");
  });

  it("prefers types[] over contentType when both are provided", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({
      siteId: SITE_ID,
      contentType: "article",
      types: ["review", "guide"],
    });
    const recorder = lastRecorder();
    const typeIn = callsOf(recorder, "in").find((c) => c.args[0] === "type");
    const typeEq = callsOf(recorder, "eq").find((c) => c.args[0] === "type");
    expect(typeIn).toBeDefined();
    expect(typeEq).toBeUndefined();
  });

  it("uses .in('status', statuses) when statuses[] is provided", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({
      siteId: SITE_ID,
      statuses: ["draft", "published"],
    });
    const statusIn = callsOf(lastRecorder(), "in").find((c) => c.args[0] === "status");
    expect(statusIn).toBeDefined();
    expect(statusIn!.args[1]).toEqual(["draft", "published"]);
  });

  it("orders by sortBy/sortDirection when provided", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({
      siteId: SITE_ID,
      sortBy: "title",
      sortDirection: "asc",
    });
    const orderCall = callsOf(lastRecorder(), "order")[0];
    expect(orderCall!.args[0]).toBe("title");
    expect(orderCall!.args[1]).toMatchObject({ ascending: true });
  });

  it("defaults to created_at desc when sort params are omitted", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({ siteId: SITE_ID });
    const orderCall = callsOf(lastRecorder(), "order")[0];
    expect(orderCall!.args[0]).toBe("created_at");
    expect(orderCall!.args[1]).toMatchObject({ ascending: false });
  });

  it("ignores empty types[] and statuses[]", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.listContent({ siteId: SITE_ID, types: [], statuses: [] });
    expect(callsOf(lastRecorder(), "in")).toHaveLength(0);
  });
});

describe("countContent — new filter parameters", () => {
  it("applies q, types, and statuses", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.countContent({
      siteId: SITE_ID,
      q: "foo",
      types: ["article"],
      statuses: ["published", "draft"],
    });
    const recorder = lastRecorder();
    expect(callsOf(recorder, "ilike")[0]!.args[0]).toBe("title");
    const ins = callsOf(recorder, "in");
    expect(ins.find((c) => c.args[0] === "type")).toBeDefined();
    expect(ins.find((c) => c.args[0] === "status")).toBeDefined();
  });

  it("still only selects head:true (count query)", async () => {
    const mod = await import("@/lib/dal/content");
    await mod.countContent({ siteId: SITE_ID });
    const selectCall = callsOf(lastRecorder(), "select")[0];
    expect(selectCall!.args[1]).toMatchObject({ count: "exact", head: true });
  });
});
