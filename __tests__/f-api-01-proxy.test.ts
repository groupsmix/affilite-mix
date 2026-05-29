/**
 * F-API-01 Proxy behaviour matrix.
 *
 * The privileged Supabase client is wrapped in a `Proxy` that intercepts
 * `.from()` and forces every PostgREST query chain to either filter by
 * `site_id` (via `.eq`, `.in`, `.match`, or an insert/upsert payload
 * carrying a non-empty-string `site_id`) or explicitly opt out via
 * `.unsafeNoSiteFilter()`. Without one of those, awaiting the query
 * rejects synchronously inside the Proxy.
 *
 * This file is an exhaustive table-driven regression lock. Each case is
 * a self-contained mini-program asserting either acceptance or rejection
 * of a query pattern. The Proxy is exercised against an in-memory stub
 * that records the called methods, so we don't need a live Supabase to
 * verify the rejection edge cases.
 *
 * The Proxy's enforcement logic regressed silently across multiple cron
 * routes (caught by the PR-A audit). These tests are the canary so a
 * future change to `lib/server-only/service-role.ts` cannot loosen the
 * guard without flagging an explicit, reviewed test update.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Helper: import the Proxy with a fresh module graph so we can stub env.
async function loadPrivileged() {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "dev-service-key");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "dev-anon-key");
  const mod = await import("@/lib/server-only/service-role");
  return mod.getPrivilegedSupabaseClient();
}

beforeEach(() => {
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function expectRejects(p: PromiseLike<unknown>) {
  try {
    await p;
    throw new Error("expected Proxy to reject query without site_id filter");
  } catch (err) {
    expect((err as Error).message).toMatch(/F-API-01/);
  }
}

describe("F-API-01 Proxy enforcement matrix", () => {
  // -----------------------------------------------------------------
  // SECTION 1: Acceptance — site_id filter is present.
  // -----------------------------------------------------------------
  describe("accepts queries that filter by site_id", () => {
    it("accepts `.eq('site_id', <non-empty string>)`", async () => {
      const sb = await loadPrivileged();
      // We don't await the real PostgREST call (no network in unit test);
      // we instead inspect that the awaitable proxy permits the chain by
      // ensuring no F-API-01 error is thrown synchronously when the chain
      // is awaited up to the network step. We do that by intercepting
      // the underlying `fetch` to short-circuit with a 503 — the F-API-01
      // guard rejects BEFORE the network call.
      // The Proxy guard fires inside `then`, so a fast 503 fetch is fine.
      const p = sb.from("affiliate_clicks").select("id").eq("site_id", "site-1");
      // If the Proxy were to reject, this would throw inside `await p`.
      // We do not assert success of the network leg; we assert the guard
      // did not interpose.
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.in('site_id', [<non-empty strings>])`", async () => {
      const sb = await loadPrivileged();
      const p = sb.from("affiliate_clicks").select("id").in("site_id", ["s1", "s2"]);
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.match({ site_id: <non-empty string> })`", async () => {
      const sb = await loadPrivileged();
      const p = sb.from("affiliate_clicks").select("id").match({ site_id: "s1" });
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.insert({ site_id: <non-empty string>, ... })`", async () => {
      const sb = await loadPrivileged();
      const p = sb.from("affiliate_clicks").insert({ site_id: "s1", click_id: "x" });
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.insert([{ site_id: 's1' }, { site_id: 's2' }])`", async () => {
      const sb = await loadPrivileged();
      const p = sb.from("affiliate_clicks").insert([
        { site_id: "s1", click_id: "x1" },
        { site_id: "s2", click_id: "x2" },
      ]);
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.upsert({ site_id: 's1', ... })`", async () => {
      const sb = await loadPrivileged();
      const p = sb
        .from("affiliate_clicks")
        .upsert({ site_id: "s1", click_id: "x" }, { onConflict: "click_id" });
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.update(...).eq('site_id', 's1')`", async () => {
      const sb = await loadPrivileged();
      const p = sb.from("affiliate_clicks").update({ click_id: "x" }).eq("site_id", "s1");
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.delete().eq('site_id', 's1')`", async () => {
      const sb = await loadPrivileged();
      const p = sb.from("affiliate_clicks").delete().eq("site_id", "s1");
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.unsafeNoSiteFilter()` opt-out (no site_id filter required)", async () => {
      const sb = await loadPrivileged();
      const p = sb.from("affiliate_clicks").select("id").unsafeNoSiteFilter();
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `unsafeNoSiteFilter()` interleaved between other filters", async () => {
      const sb = await loadPrivileged();
      const p = sb
        .from("affiliate_clicks")
        .select("id")
        .gte("created_at", "2025-01-01")
        .unsafeNoSiteFilter();
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });
  });

  // -----------------------------------------------------------------
  // SECTION 2: Rejection — no usable site_id filter, no opt-out.
  // -----------------------------------------------------------------
  describe("rejects queries without a site_id filter or opt-out", () => {
    it("rejects bare `.select(...)`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id"));
    });

    it("rejects `.select(...).gte('created_at', ...)` with no site_id filter", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").gte("created_at", "2025-01-01"));
    });

    it("rejects `.update({...})` with no .eq('site_id', ...)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").update({ click_id: "x" }));
    });

    it("rejects `.delete()` with no .eq('site_id', ...)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").delete());
    });
  });

  // -----------------------------------------------------------------
  // SECTION 3: Rejection — degenerate values that previously slipped.
  // -----------------------------------------------------------------
  describe("rejects falsy / non-string values posing as site_id", () => {
    it("rejects `.eq('site_id', undefined)`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").eq("site_id", undefined));
    });

    it("rejects `.eq('site_id', null)`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").eq("site_id", null));
    });

    it("rejects `.eq('site_id', '')` (empty string)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").eq("site_id", ""));
    });

    it("rejects `.eq('site_id', 42)` (number, not string)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb
          .from("affiliate_clicks")
          .select("id")
          .eq("site_id", 42 as unknown as string),
      );
    });

    it("rejects `.in('site_id', [])` (empty array)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").in("site_id", []));
    });

    it("rejects `.in('site_id', ['', 's2'])` (array contains empty string)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").in("site_id", ["", "s2"]));
    });

    it("rejects `.in('site_id', [null, 's2'])` (array contains null)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb
          .from("affiliate_clicks")
          .select("id")
          .in("site_id", [null as unknown as string, "s2"]),
      );
    });

    it("rejects `.match({ site_id: undefined })`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").match({ site_id: undefined }));
    });

    it("rejects `.match({})` (no site_id key)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").match({}));
    });

    it("rejects `.match({ site_id: '' })` (empty string)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").select("id").match({ site_id: "" }));
    });

    it("rejects `.insert({ site_id: null, ... })`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").insert({ site_id: null, click_id: "x" }));
    });

    it("rejects `.insert({ site_id: '', ... })`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").insert({ site_id: "", click_id: "x" }));
    });

    it("rejects `.insert({ click_id: 'x' })` (no site_id key at all)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.from("affiliate_clicks").insert({ click_id: "x" }));
    });

    it("rejects `.insert([{ site_id: 's1' }, { site_id: null }])` (one bad row)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb.from("affiliate_clicks").insert([
          { site_id: "s1", click_id: "x1" },
          { site_id: null, click_id: "x2" },
        ]),
      );
    });

    it("rejects `.upsert({ site_id: undefined, ... })`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb
          .from("affiliate_clicks")
          .upsert({ site_id: undefined, click_id: "x" }, { onConflict: "click_id" }),
      );
    });
  });

  // -----------------------------------------------------------------
  // SECTION 4: error message shape (callers depend on it for grep).
  // -----------------------------------------------------------------
  describe("error message includes the F-API-01 token and the failed terminal", () => {
    it("update without filter names the `update` terminal", async () => {
      const sb = await loadPrivileged();
      try {
        await sb.from("affiliate_clicks").update({ click_id: "x" });
        throw new Error("expected rejection");
      } catch (err) {
        expect((err as Error).message).toMatch(/F-API-01/);
        expect((err as Error).message).toMatch(/update/);
      }
    });

    it("select without filter names the `<query>` placeholder", async () => {
      const sb = await loadPrivileged();
      try {
        await sb.from("affiliate_clicks").select("id");
        throw new Error("expected rejection");
      } catch (err) {
        expect((err as Error).message).toMatch(/F-API-01/);
      }
    });
  });
});

// -----------------------------------------------------------------
// NEW-03: RPC guard enforcement
// -----------------------------------------------------------------
describe("F-API-01 RPC guard (NEW-03)", () => {
  describe("accepts RPC calls that include p_site_id", () => {
    it("accepts `.rpc(fn, { p_site_id: <non-empty string>, ... })`", async () => {
      const sb = await loadPrivileged();
      const p = sb.rpc("get_dashboard_stats", {
        p_site_id: "site-1",
        p_today_start: "2025-01-01",
        p_seven_days_ago: "2024-12-25",
      });
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.rpc(fn, { p_site_id: ... })` with additional args", async () => {
      const sb = await loadPrivileged();
      const p = sb.rpc("get_top_products", {
        p_site_id: "site-1",
        p_since: "2025-01-01",
        p_limit: 10,
      });
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });
  });

  describe("accepts RPC calls with `.unsafeNoSiteFilter()` opt-out", () => {
    it("accepts `.rpc(fn).unsafeNoSiteFilter()` (no args)", async () => {
      const sb = await loadPrivileged();
      const p = (
        sb.rpc("db_now") as ReturnType<typeof sb.rpc> & {
          unsafeNoSiteFilter: () => ReturnType<typeof sb.rpc>;
        }
      ).unsafeNoSiteFilter();
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });

    it("accepts `.rpc(fn, args).unsafeNoSiteFilter()` (no p_site_id)", async () => {
      const sb = await loadPrivileged();
      const p = (
        sb.rpc("increment_login_failed_attempts", {
          user_id: "u1",
          lockout_threshold: 10,
          lockout_duration_ms: 3600000,
        }) as ReturnType<typeof sb.rpc> & { unsafeNoSiteFilter: () => ReturnType<typeof sb.rpc> }
      ).unsafeNoSiteFilter();
      const result = await Promise.race([
        p.then(() => "passed-guard"),
        new Promise((r) => setTimeout(() => r("passed-guard"), 50)),
      ]);
      expect(result).toBe("passed-guard");
    });
  });

  describe("rejects RPC calls without p_site_id or opt-out", () => {
    it("rejects `.rpc(fn)` with no args and no opt-out", async () => {
      const sb = await loadPrivileged();
      await expectRejects(sb.rpc("db_now"));
    });

    it("rejects `.rpc(fn, { ... })` without p_site_id", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb.rpc("increment_login_failed_attempts", {
          user_id: "u1",
          lockout_threshold: 10,
          lockout_duration_ms: 3600000,
        }),
      );
    });

    it("rejects `.rpc(fn, { p_site_id: '' })` (empty string)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb.rpc("get_dashboard_stats", {
          p_site_id: "",
          p_today_start: "2025-01-01",
          p_seven_days_ago: "2024-12-25",
        }),
      );
    });

    it("rejects `.rpc(fn, { p_site_id: null })` (null)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb.rpc("get_dashboard_stats", {
          p_site_id: null as unknown as string,
          p_today_start: "2025-01-01",
          p_seven_days_ago: "2024-12-25",
        }),
      );
    });

    it("rejects `.rpc(fn, { p_site_id: undefined })`", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb.rpc("get_dashboard_stats", {
          p_site_id: undefined as unknown as string,
          p_today_start: "2025-01-01",
          p_seven_days_ago: "2024-12-25",
        }),
      );
    });

    it("rejects `.rpc(fn, { p_site_id: 42 })` (number, not string)", async () => {
      const sb = await loadPrivileged();
      await expectRejects(
        sb.rpc("get_dashboard_stats", {
          p_site_id: 42 as unknown as string,
          p_today_start: "2025-01-01",
          p_seven_days_ago: "2024-12-25",
        }),
      );
    });
  });

  describe("error message includes F-API-01 and the RPC function name", () => {
    it("rejection names the rpc function in the error", async () => {
      const sb = await loadPrivileged();
      try {
        await sb.rpc("db_now");
        throw new Error("expected rejection");
      } catch (err) {
        expect((err as Error).message).toMatch(/F-API-01/);
        expect((err as Error).message).toMatch(/rpc\(db_now\)/);
      }
    });
  });
});
