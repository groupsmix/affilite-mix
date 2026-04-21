import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listAdPlacements } from "@/lib/dal/ad-placements";
import { getAdImpressionStats } from "@/lib/dal/ad-impressions";
import { redirect } from "next/navigation";
import { AdPlacementList } from "./ad-placement-list";
import { KpiCard } from "../components/dashboard/kpi-card";
import { DEFAULT_CPM, resolveCpm } from "@/lib/ads/cpm-defaults";

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
  const placementRevenue = new Map<string, number>();
  let totalEstRevenue = 0;
  for (const p of placements) {
    const impressions = impressionMap.get(p.id) ?? 0;
    const cpm = resolveCpm(p);
    const revenue = (impressions / 1000) * cpm;
    placementRevenue.set(p.id, revenue);
    totalEstRevenue += revenue;
  }

  // KPI inputs derived from the same data used in the per-placement table
  // below, so the headline cards always agree with the detailed breakdown.
  const activePlacementCount = placements.filter((p) => p.is_active).length;
  const providersInUse = new Set(placements.map((p) => p.provider)).size;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad Placements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage ad slots for sites monetized with ads.
          </p>
        </div>
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

      {/* Ad Analytics Summary — impressions + revenue estimation */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Analytics (Last 30 Days)</h3>

        {/* Top-level KPIs */}
        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-medium text-gray-500">Total Impressions</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {totalImpressions.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-medium text-gray-500">Est. Revenue</p>
            <p className="mt-1 text-2xl font-bold text-green-700">${totalEstRevenue.toFixed(2)}</p>
          </div>
          <div className="rounded-md border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-medium text-gray-500">Active Placements</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {placements.filter((p) => p.is_active).length} / {placements.length}
            </p>
          </div>
        </div>

        {/* Per-placement breakdown */}
        {placements.length > 0 && (
          <div className="overflow-hidden rounded-md border border-gray-100">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Placement</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                  <th className="px-3 py-2 text-right font-medium">Impressions</th>
                  <th className="px-3 py-2 text-right font-medium">CPM</th>
                  <th className="px-3 py-2 text-right font-medium">Est. Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {placements.map((p) => {
                  const impressions = impressionMap.get(p.id) ?? 0;
                  const cpm = resolveCpm(p);
                  const revenue = placementRevenue.get(p.id) ?? 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-900">{p.name}</td>
                      <td className="px-3 py-2 text-gray-500">{p.provider}</td>
                      <td className="px-3 py-2 text-right text-gray-900">
                        {impressions.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">${cpm.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">
                        ${revenue.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-gray-400">
          Revenue estimates are based on default CPM rates by provider (
          {Object.entries(DEFAULT_CPM)
            .map(([k, v]) => `${k}: $${v.toFixed(2)}`)
            .join(", ")}
          ). Set a custom <code className="rounded bg-gray-100 px-1">est_cpm</code> in the placement
          config for more accurate estimates.
        </p>
      </div>

      <AdPlacementList placements={placements} />
    </div>
  );
}
