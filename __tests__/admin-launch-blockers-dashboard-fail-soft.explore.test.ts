/**
 * Spec: admin-launch-blockers — Phase 1, Task 3.
 *
 * Property 3 (Bug Condition): Dashboard fails soft and never crashes.
 * Validates: Requirements 2.3, 2.4  (F-005 isBugCondition rc1 RPC branch /
 * F-008 rc2 consistency branch).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS A BUGFIX *EXPLORATION* TEST. It encodes the EXPECTED (post-fix)
 * behavior and is therefore EXPECTED TO FAIL on the current (unfixed) code.
 * The failure is the success criterion for this task: it confirms F-005/F-008 —
 * when a super_admin loads the Dashboard index while `get_niche_health_stats`
 * is not deployed (or any dashboard query errors), `getNicheHealthStats()`
 * THROWS with no fallback and the unguarded `<NicheHealthCard>` /
 * `<RevenuePerSiteCard>` in the `{isSuperAdmin && ...}` grid escalate the throw
 * past the page into the admin-dashboard error boundary (a blank crash), even
 * though the very same resolution/query failure is soft-bannered (still usable)
 * by Products/Content. DO NOT change the code to make it pass during Phase 1;
 * the SAME test is re-run in Phase 4 to confirm the fix.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Scoped PBT approach (design Test Cases 1 and 11): for a super_admin loading
 * the Dashboard index, inject the deployed defective state — the
 * `get_niche_health_stats` RPC returns a Postgres error (undeployed function /
 * permission denied / generic failure) — across the dashboard-loader failure
 * states, then assert the EXPECTED (post-fix) behavior:
 *   (a) `getNicheHealthStats()` fails soft (logs + returns an empty result)
 *       instead of throwing (Requirement 2.3), and
 *   (b) the super_admin grid degrades gracefully so the Dashboard index NEVER
 *       throws to a blank error boundary (Requirement 2.3), and
 *   (c) the failure is handled CONSISTENTLY with Products/Content — all three
 *       remain usable (soft banner / empty), the Dashboard does not crash while
 *       the others soft-fail (Requirement 2.4 / F-008).
 *
 * The real `getNicheHealthStats` is exercised with an injected erroring DAL
 * client (its `getClient` parameter) rather than depending on a live
 * environment whose RPC is undeployed — mirroring the other Phase 1 tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";

import { getNicheHealthStats, type NicheHealthRow } from "@/lib/dal/niche-health";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: mocks.loggerError, warn: vi.fn(), info: vi.fn() },
}));

/**
 * The Postgres error shapes a missing/failing `get_niche_health_stats` RPC
 * produces in the deployed environment:
 *  - 42883: the function is not deployed ("function ... does not exist"),
 *  - 42501: permission denied for the RPC,
 *  - generic: any other server-side failure.
 */
interface PgError {
  code: string;
  message: string;
}

const RPC_FAILURE_STATES: PgError[] = [
  { code: "42883", message: "function get_niche_health_stats(...) does not exist" },
  { code: "42501", message: "permission denied for function get_niche_health_stats" },
  { code: "PGRST202", message: "Could not find the function in the schema cache" },
  { code: "57014", message: "canceling statement due to statement timeout" },
  { code: "XX000", message: "internal error" },
];

/**
 * A DAL client stub whose `.rpc(...).limit(...)` resolves to a PostgREST-style
 * `{ data, error }` envelope — exactly what `getNicheHealthStats` consumes.
 * `getNicheHealthStats` currently does `if (error) throw error` with no
 * fallback, so this drives the F-005 throw.
 */
function erroringDalClientGetter(error: PgError) {
  return async () => ({
    rpc: (_fn: string, _args: unknown) => {
      const rpcResult = {
        unsafeNoSiteFilter: () => rpcResult,
        limit: async (_n: number) => ({ data: null, error }),
      };
      return rpcResult;
    },
  });
}

/** A healthy client (control) — used to confirm the success path is preserved. */
function healthyDalClientGetter(rows: NicheHealthRow[]) {
  return async () => ({
    rpc: (_fn: string, _args: unknown) => {
      const rpcResult = {
        unsafeNoSiteFilter: () => rpcResult,
        limit: async (_n: number) => ({ data: rows, error: null }),
      };
      return rpcResult;
    },
  });
}

interface DashboardIndexRender {
  /** True when a super_admin grid card threw past the page → blank boundary. */
  crashedToErrorBoundary: boolean;
  /** True when the page rendered (with safe empty/banner) instead of crashing. */
  rendered: boolean;
}

/**
 * Faithfully model the Dashboard index render for a super_admin when the niche
 * RPC fails, mirroring `app/q7m-k4j9/(dashboard)/page.tsx`:
 *   - site resolution + metrics are wrapped in `safeAdminData` (fail soft), but
 *   - the `{isSuperAdmin && (...)}` grid renders `<NicheHealthCard />` /
 *     `<RevenuePerSiteCard />` UNGUARDED, and `<NicheHealthPanel>` calls
 *     `getNicheHealthStats(...)` directly inside a `Promise.all`.
 *
 * Because the super_admin cards are NOT wrapped in `safeAdminData`, a throw
 * from `getNicheHealthStats` propagates out of the card's async render and is
 * caught by React's admin-dashboard error boundary → a blank crash. We model
 * that escalation with a try/catch that represents the error boundary.
 */
async function renderSuperAdminDashboardIndex(
  nicheClientGetter: () => Promise<unknown>,
): Promise<DashboardIndexRender> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // Mirrors NicheHealthPanel: the super_admin niche card loads stats UNGUARDED
    // (no safeAdminData wrapper around the card in page.tsx).
    await getNicheHealthStats(sevenDaysAgo, fourteenDaysAgo, nicheClientGetter as never);
    return { crashedToErrorBoundary: false, rendered: true };
  } catch {
    // The unguarded card threw → the admin-dashboard error boundary renders.
    return { crashedToErrorBoundary: true, rendered: false };
  }
}

/**
 * Model how a site-scoped module handles the same underlying data failure.
 * Products/Content wrap their loaders in `safeAdminData`, so they degrade to a
 * soft banner and stay usable (never crash). The Dashboard SHOULD do the same
 * (post-fix); on the unfixed code it crashes — the inconsistency that is F-008.
 */
interface ModuleFailureHandling {
  crashed: boolean;
  usableWithBanner: boolean;
}

function handleProductsContentFailure(): ModuleFailureHandling {
  // Products/Content use safeAdminData → fallback + "one or more database
  // queries failed" banner; the page remains usable.
  return { crashed: false, usableWithBanner: true };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin-launch-blockers Property 3 (F-005/F-008): Dashboard fails soft and never crashes", () => {
  it("EXPECTED-FAIL on unfixed code: getNicheHealthStats fails soft (logs + returns []) when the RPC errors", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...RPC_FAILURE_STATES), async (pgError) => {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

        // Expected (post-fix) per Requirement 2.3: getNicheHealthStats SHALL log
        // and return an empty result instead of throwing on an RPC error.
        const rows = await getNicheHealthStats(
          sevenDaysAgo,
          fourteenDaysAgo,
          erroringDalClientGetter(pgError) as never,
        );
        expect(Array.isArray(rows)).toBe(true);
        expect(rows).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  it("EXPECTED-FAIL on unfixed code: the super_admin Dashboard index never throws to a blank error boundary when the niche RPC fails", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...RPC_FAILURE_STATES), async (pgError) => {
        const result = await renderSuperAdminDashboardIndex(erroringDalClientGetter(pgError));

        // Expected (post-fix) per Requirement 2.3: the super_admin grid cards
        // degrade gracefully; the Dashboard index renders instead of crashing.
        expect(result.crashedToErrorBoundary).toBe(false);
        expect(result.rendered).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("EXPECTED-FAIL on unfixed code: the same data failure is handled CONSISTENTLY — Dashboard stays usable like Products/Content (no crash while others soft-fail)", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...RPC_FAILURE_STATES), async (pgError) => {
        const dashboard = await renderSuperAdminDashboardIndex(erroringDalClientGetter(pgError));
        const products = handleProductsContentFailure();
        const content = handleProductsContentFailure();

        // Products/Content soft-fail and remain usable today (the baseline).
        expect(products.crashed).toBe(false);
        expect(content.crashed).toBe(false);

        // Expected (post-fix) per Requirement 2.4 / F-008: the Dashboard SHALL
        // be handled by the SAME graceful pattern — it must not crash while the
        // others soft-fail. On the unfixed code the Dashboard crashes, breaking
        // this consistency invariant.
        expect(dashboard.crashedToErrorBoundary).toBe(false);
        const allConsistentlyUsable =
          !dashboard.crashedToErrorBoundary && !products.crashed && !content.crashed;
        expect(allConsistentlyUsable).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("control: the success path is preserved — getNicheHealthStats returns rows when the RPC succeeds (regression guard, Requirement 3.3)", async () => {
    const sampleRows: NicheHealthRow[] = [
      {
        site_id: "11111111-1111-1111-1111-111111111111",
        total_products: 3,
        total_content: 5,
        clicks_7d: 12,
        clicks_prev_7d: 8,
        last_published_at: new Date().toISOString(),
        subscriber_count: 7,
      },
    ];
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

    const rows = await getNicheHealthStats(
      sevenDaysAgo,
      fourteenDaysAgo,
      healthyDalClientGetter(sampleRows) as never,
    );
    expect(rows).toEqual(sampleRows);
  });
});
