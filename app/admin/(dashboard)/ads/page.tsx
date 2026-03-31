import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listAdPlacements } from "@/lib/dal/ad-placements";
import { getAdImpressionStats } from "@/lib/dal/ad-impressions";
import { redirect } from "next/navigation";
import { AdPlacementList } from "./ad-placement-list";

export default async function AdsPage() {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const siteId = await resolveDbSiteId(session.activeSiteSlug);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const [placements, impressionStats] = await Promise.all([
    listAdPlacements(siteId),
    getAdImpressionStats(siteId, thirtyDaysAgo).catch(() => []),
  ]);

  // Build a lookup map: placement_id → total impressions
  const impressionMap = new Map<string, number>();
  for (const stat of impressionStats) {
    impressionMap.set(stat.ad_placement_id, stat.total_impressions);
  }

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

      {/* Ad Impression Analytics Summary */}
      {impressionStats.length > 0 && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Impressions (Last 30 Days)
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {placements.map((p) => (
              <div key={p.id} className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <p className="text-xs font-medium text-gray-500">{p.name}</p>
                <p className="mt-1 text-2xl font-bold text-gray-900">
                  {(impressionMap.get(p.id) ?? 0).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <AdPlacementList placements={placements} />
    </div>
  );
}
