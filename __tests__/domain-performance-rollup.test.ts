/**
 * Verification suite — R10 (domain rollup via an injected privileged client).
 *
 * `getDomainPerformance(sinceIso, getClient)` iterates the global site
 * registry (`listSites`) and counts clicks per site (`getClickCount`),
 * computing `revenue = round(clicks * est_revenue_per_click, 2)`. Both helpers
 * pull their Supabase client from the injected `DalClientGetter`, so the rollup
 * logic can be exercised end-to-end against an in-memory fake — no real
 * Supabase or network call.
 *
 * Tasks covered:
 *  - 5.1 — Property 6: Domain rollup reflects the underlying per-site data.
 *  - 5.2 — Client-retrieval error path (R10.9).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import fc from "fast-check";

// `listSites` is wrapped in `unstable_cache`, keyed by ["all-sites"] — NOT by
// the injected client. Left intact it would memoise the first run's sites and
// poison every subsequent property iteration. Replace it with a pass-through so
// each call re-reads from the freshly injected fake client (same pattern used
// across the existing DAL test suite).
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

import { getDomainPerformance } from "@/lib/dal/analytics-dashboard";
import type { DalClientGetter } from "@/lib/dal/dal-client";

const SINCE_ISO = "2020-01-01T00:00:00.000Z";

// `shouldSkipDbCall()` short-circuits `listSites`/`getClickCount` to empty/zero
// whenever NEXT_PUBLIC_SUPABASE_URL is missing or contains "placeholder" (the
// vitest default). Point it at a real-looking URL so the injected fake client
// path actually executes.
const ORIGINAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rollup-test.supabase.co";
});
afterAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL_SUPABASE_URL;
});

// ── In-memory fake Supabase client ───────────────────────────────────────

interface FakeSite {
  id: string;
  slug: string;
  name: string;
  domain: string;
  est_revenue_per_click: number;
}

/**
 * Builds a `DalClientGetter` returning a stub client that answers exactly the
 * two queries `getDomainPerformance` issues:
 *   - `from("sites").select(...).unsafeNoSiteFilter().order(...)` → the site rows
 *   - `from("affiliate_clicks").select("id",{count}).eq("site_id", id)...` → that
 *     site's injected click count
 * Every chain method returns the builder; the builder is thenable so `await`
 * resolves to the appropriate `{ data | count, error }` shape.
 */
function makeFakeClient(sites: FakeSite[], clickCounts: Record<string, number>): DalClientGetter {
  function makeBuilder(table: string) {
    const eqs: Record<string, unknown> = {};
    const builder = {
      select: (_cols?: unknown, _opts?: unknown) => builder,
      unsafeNoSiteFilter: () => builder,
      order: () => builder,
      eq: (col: string, val: unknown) => {
        eqs[col] = val;
        return builder;
      },
      gte: () => builder,
      lte: () => builder,
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        let result: unknown;
        if (table === "sites") {
          result = { data: sites, error: null };
        } else if (table === "affiliate_clicks") {
          const siteId = eqs["site_id"] as string;
          result = { count: clickCounts[siteId] ?? 0, error: null };
        } else {
          result = { data: [], count: 0, error: null };
        }
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from: (table: string) => makeBuilder(table),
  };

  return () => client as never;
}

// Implementation rounds with `parseFloat((n).toFixed(2))`; expectations mirror
// that exactly so floating-point representation matches bit-for-bit.
function round2(n: number): number {
  return parseFloat(n.toFixed(2));
}

// ── Task 5.1 — Property 6 ─────────────────────────────────────────────────

describe("R10 domain rollup — Property 6: rollup reflects underlying per-site data", () => {
  // Feature: audit-fix-verification, Property 6: Domain rollup reflects the underlying per-site data
  // Validates: Requirements 10.3, 10.8
  it("returns one row per site with injected clicks and round(clicks*rate, 2) revenue", async () => {
    const siteSpec = fc.record({
      clickCount: fc.nat({ max: 100_000 }),
      rate: fc.double({ min: 0, max: 10_000, noNaN: true }),
    });

    await fc.assert(
      fc.asyncProperty(fc.array(siteSpec, { maxLength: 8 }), async (specs) => {
        const sites: FakeSite[] = specs.map((_s, i) => ({
          id: `site-${i}`,
          slug: `slug-${i}`,
          name: `Site ${i}`,
          domain: `site${i}.example.com`,
          est_revenue_per_click: specs[i]!.rate,
        }));
        const clickCounts: Record<string, number> = {};
        for (let i = 0; i < specs.length; i++) {
          clickCounts[`site-${i}`] = specs[i]!.clickCount;
        }

        const getter = makeFakeClient(sites, clickCounts);
        const rows = await getDomainPerformance(SINCE_ISO, getter);

        // One row per site.
        expect(rows.length).toBe(sites.length);

        const rateById = new Map(sites.map((s) => [s.id, s.est_revenue_per_click]));
        for (const row of rows) {
          const expectedClicks = clickCounts[row.siteId];
          expect(row.clicks).toBe(expectedClicks);
          expect(row.revenue).toBe(round2(expectedClicks! * rateById.get(row.siteId)!));
        }

        // All-zero iff every injected click count is zero.
        const everyCountZero = specs.every((s) => s.clickCount === 0);
        const resultAllZero = rows.every((r) => r.clicks === 0 && r.revenue === 0);
        expect(resultAllZero).toBe(everyCountZero);
      }),
      { numRuns: 100 },
    );
  });

  it("returns all-zero values when no underlying records exist (R10.8)", async () => {
    const sites: FakeSite[] = [
      { id: "s1", slug: "s1", name: "S1", domain: "s1.example.com", est_revenue_per_click: 0.5 },
      { id: "s2", slug: "s2", name: "S2", domain: "s2.example.com", est_revenue_per_click: 1.25 },
    ];
    const getter = makeFakeClient(sites, { s1: 0, s2: 0 });
    const rows = await getDomainPerformance(SINCE_ISO, getter);

    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.clicks === 0 && r.revenue === 0)).toBe(true);
  });

  it("reflects non-zero underlying records and is not all-zero (R10.3)", async () => {
    const sites: FakeSite[] = [
      { id: "s1", slug: "s1", name: "S1", domain: "s1.example.com", est_revenue_per_click: 0.5 },
    ];
    const getter = makeFakeClient(sites, { s1: 10 });
    const rows = await getDomainPerformance(SINCE_ISO, getter);

    expect(rows[0]!.clicks).toBe(10);
    expect(rows[0]!.revenue).toBe(5); // round(10 * 0.5, 2)
  });
});

// ── Task 5.2 — Client-retrieval error path (R10.9) ────────────────────────

describe("R10.9 domain rollup — client-retrieval error path", () => {
  it("surfaces an error and returns no rows when the getter yields an unusable client", async () => {
    // R10.9: an unusable Privileged_Client MUST surface a client-retrieval
    // error rather than silently returning zero-valued rows.
    const unusableClientGetter: DalClientGetter = () => null as never;

    await expect(getDomainPerformance(SINCE_ISO, unusableClientGetter)).rejects.toBeTruthy();
  });

  it("surfaces an error and returns no rows when the getter throws", async () => {
    const throwingGetter: DalClientGetter = () => {
      throw new Error("client retrieval failure");
    };

    await expect(getDomainPerformance(SINCE_ISO, throwingGetter)).rejects.toThrow(
      /client retrieval failure/,
    );
  });
});
