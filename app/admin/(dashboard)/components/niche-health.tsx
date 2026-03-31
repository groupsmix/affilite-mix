import { listSites } from "@/lib/dal/sites";
import { getNicheHealthStats } from "@/lib/dal/niche-health";
import Link from "next/link";

interface NicheHealth {
  siteId: string;
  name: string;
  slug: string;
  totalProducts: number;
  totalContent: number;
  clicks7d: number;
  clicksPrev7d: number;
  lastPublishedAt: string | null;
  subscriberCount: number;
  issues: string[];
}

export async function NicheHealthPanel() {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch sites and aggregated stats in parallel (single RPC replaces N+1 queries)
  const [sites, stats] = await Promise.all([
    listSites(),
    getNicheHealthStats(sevenDaysAgo, fourteenDaysAgo),
  ]);

  const statsMap = new Map(stats.map((s) => [s.site_id, s]));

  const healthData: NicheHealth[] = sites
    .filter((s) => s.is_active)
    .map((site) => {
      const s = statsMap.get(site.id);
      const totalProducts = s?.total_products ?? 0;
      const totalContent = s?.total_content ?? 0;
      const clicks7d = s?.clicks_7d ?? 0;
      const clicksPrev7d = s?.clicks_prev_7d ?? 0;
      const lastPublishedAt = s?.last_published_at ?? null;
      const subscriberCount = s?.subscriber_count ?? 0;

      const issues: string[] = [];

      if (clicks7d === 0) {
        issues.push("No clicks in 7 days");
      }
      if (lastPublishedAt) {
        const daysSincePublish = Math.floor(
          (now.getTime() - new Date(lastPublishedAt).getTime()) / (1000 * 60 * 60 * 24),
        );
        if (daysSincePublish > 14) {
          issues.push(`Content stale (${daysSincePublish}d ago)`);
        }
      } else {
        issues.push("No published content");
      }
      if (totalProducts === 0) {
        issues.push("No products");
      }

      return {
        siteId: site.id,
        name: site.name,
        slug: site.slug,
        totalProducts,
        totalContent,
        clicks7d,
        clicksPrev7d,
        lastPublishedAt,
        subscriberCount,
        issues,
      };
    });

  // Sort: niches with issues first, then by click count descending
  const sorted = [...healthData].sort((a, b) => {
    if (a.issues.length > 0 && b.issues.length === 0) return -1;
    if (a.issues.length === 0 && b.issues.length > 0) return 1;
    return b.clicks7d - a.clicks7d;
  });

  const nichesNeedingAttention = sorted.filter((n) => n.issues.length > 0);

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Niche Health
      </h2>

      {nichesNeedingAttention.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-medium text-amber-800">
            {nichesNeedingAttention.length} niche(s) need attention
          </p>
          <ul className="space-y-1">
            {nichesNeedingAttention.map((n) => (
              <li key={n.siteId} className="text-sm text-amber-700">
                <span className="font-medium">{n.name}:</span> {n.issues.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((niche) => {
          const trend =
            niche.clicksPrev7d > 0
              ? ((niche.clicks7d - niche.clicksPrev7d) / niche.clicksPrev7d) * 100
              : niche.clicks7d > 0
                ? 100
                : 0;

          const daysSincePublish = niche.lastPublishedAt
            ? Math.floor(
                (now.getTime() - new Date(niche.lastPublishedAt).getTime()) / (1000 * 60 * 60 * 24),
              )
            : null;

          return (
            <div
              key={niche.siteId}
              className={`rounded-lg border bg-white p-4 ${
                niche.issues.length > 0 ? "border-amber-300" : "border-gray-200"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">{niche.name}</h3>
                {niche.issues.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Needs attention
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-gray-500">Clicks (7d):</span>{" "}
                  <span className="font-medium text-gray-900">{niche.clicks7d}</span>
                  {trend !== 0 && (
                    <span
                      className={`ml-1 text-xs ${trend > 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {trend > 0 ? "\u2191" : "\u2193"}
                      {Math.abs(trend).toFixed(0)}%
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-gray-500">Products:</span>{" "}
                  <span className="font-medium text-gray-900">{niche.totalProducts}</span>
                </div>
                <div>
                  <span className="text-gray-500">Content:</span>{" "}
                  <span className="font-medium text-gray-900">{niche.totalContent}</span>
                </div>
                <div>
                  <span className="text-gray-500">Subscribers:</span>{" "}
                  <span className="font-medium text-gray-900">{niche.subscriberCount}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Last published:</span>{" "}
                  <span
                    className={`font-medium ${
                      daysSincePublish !== null && daysSincePublish > 14
                        ? "text-amber-600"
                        : "text-gray-900"
                    }`}
                  >
                    {daysSincePublish !== null ? `${daysSincePublish}d ago` : "Never"}
                  </span>
                </div>
              </div>

              <Link
                href="/admin/analytics"
                className="mt-2 block text-xs text-blue-600 hover:underline"
              >
                View analytics
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
