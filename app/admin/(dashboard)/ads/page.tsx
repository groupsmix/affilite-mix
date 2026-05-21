import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listAdPlacements } from "@/lib/dal/ad-placements";
import { getAdImpressionStats } from "@/lib/dal/ad-impressions";
import { redirect } from "next/navigation";
import { KpiCard } from "../components/dashboard/kpi-card";
import { DEFAULT_CPM, resolveCpm } from "@/lib/ads/cpm-defaults";

import { ADS_TABLE_PAGE_SIZE, AdsTable, type AdsTableRow } from "./ads-table";
import { NewAdPlacementDialog } from "./new-ad-placement-dialog";

export default async function AdsPage() {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const siteId = await resolveDbSiteId(session.activeSiteSlug);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const [placements, impressionStats] = await Promise.all([
    listAdPlacements(siteId),
    getAdImpressionStats(siteId, thirtyDaysAgo).catch(() => []),
  ]);

  // Build a lookup map: placement_id → total impressions
  const impressionMap = new Map<string, number>();
  for (const stat of impressionStats) {
    impressionMap.set(stat.ad_placement_id, stat.total_impressions);
  }

  // Compute totals for the analytics summary
  const totalImpressions = Array.from(impressionMap.values()).reduce((a, b) => a + b, 0);

  // Estimate revenue per placement using the shared CPM resolver
  // (per-placement `config.est_cpm` override → provider default → fallback).
  let totalEstRevenue = 0;
  const rows: AdsTableRow[] = placements.map((p) => {
    const impressions = impressionMap.get(p.id) ?? 0;
    const cpm = resolveCpm(p);
    const revenue = (impressions / 1000) * cpm;
    totalEstRevenue += revenue;
    const cpmOverrideRaw = (p.config as Record<string, unknown> | null)?.est_cpm;
    const cpmIsOverride = typeof cpmOverrideRaw === "number" && Number.isFinite(cpmOverrideRaw);
    return {
      id: p.id,
      name: p.name,
      placement_type: p.placement_type,
      provider: p.provider,
      is_active: p.is_active,
      impressions_30d: impressions,
      est_revenue_30d: revenue,
      cpm,
      cpm_is_override: cpmIsOverride,
      created_at: p.created_at,
    };
  });

  // KPI inputs derived from the same data used in the per-placement table
  // below, so the headline cards always agree with the detailed breakdown.
  const activePlacementCount = placements.filter((p) => p.is_active).length;
  const providersInUse = new Set(placements.map((p) => p.provider)).size;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ad Placements</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage ad slots for sites monetized with ads.
          </p>
        </div>
        <NewAdPlacementDialog />
      </div>

      {/* Headline KPIs (Last 30 Days) — reuse the dashboard KpiCard so the
          styling matches /admin. Formulas are documented in the PR body. */}
      <div
        aria-live="polite"
        className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="ads-kpi-row"
      >
        <KpiCard
          title="Impressions (30d)"
          value={totalImpressions.toLocaleString()}
          description="Total ad impressions across all placements in the last 30 days."
        />
        <KpiCard
          title="Est. revenue (30d)"
          value={`$${totalEstRevenue.toFixed(2)}`}
          description="Σ (impressions × CPM ÷ 1000) per placement."
        />
        <KpiCard
          title="Active placements"
          value={activePlacementCount.toLocaleString()}
          description={`${placements.length.toLocaleString()} total placement${placements.length === 1 ? "" : "s"}.`}
        />
        <KpiCard
          title="Providers in use"
          value={providersInUse.toLocaleString()}
          description="Distinct ad providers across all placements."
        />
      </div>

      <AdsTable
        data={rows}
        totalCount={rows.length}
        showEmptyState
        pageSize={ADS_TABLE_PAGE_SIZE}
      />

      <p className="mt-3 text-xs text-muted-foreground">
        Revenue estimates are based on default CPM rates by provider (
        {Object.entries(DEFAULT_CPM)
          .map(([k, v]) => `${k}: $${v.toFixed(2)}`)
          .join(", ")}
        ). Set a custom <code className="rounded bg-muted px-1">est_cpm</code> in the placement
        config for a per-placement override.
      </p>
    </div>
  );
}
