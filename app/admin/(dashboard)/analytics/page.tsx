import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import {
  getClickCount,
  getRecentClicks,
  getTopProducts,
  getTopReferrers,
  getTopContentSlugs,
  getDailyClicks,
} from "@/lib/dal/affiliate-clicks";
import { countProducts } from "@/lib/dal/products";
import { redirect } from "next/navigation";
import { ClickChart } from "./click-chart";
import { LocalTime } from "./local-time";
import { ExpandableTable } from "./expandable-table";
import { getSiteById } from "@/config/sites";

/** Default estimated revenue per click (USD). Overridden by site config. */
const DEFAULT_EST_REVENUE_PER_CLICK = 0.35;

export default async function AnalyticsPage() {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const siteId = await resolveDbSiteId(session.activeSiteSlug);
  const siteConfig = getSiteById(session.activeSiteSlug);
  const EST_REVENUE_PER_CLICK = siteConfig?.estRevenuePerClick ?? DEFAULT_EST_REVENUE_PER_CLICK;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    clicksToday,
    clicks7d,
    clicks30d,
    clicksAllTime,
    topProducts,
    topReferrers,
    topContent,
    dailyClicks,
    recentClicks,
    totalProducts,
  ] = await Promise.all([
    getClickCount(siteId, todayStart),
    getClickCount(siteId, sevenDaysAgo),
    getClickCount(siteId, thirtyDaysAgo),
    getClickCount(siteId),
    getTopProducts(siteId, thirtyDaysAgo, 50),
    getTopReferrers(siteId, thirtyDaysAgo, 50),
    getTopContentSlugs(siteId, thirtyDaysAgo, 50),
    getDailyClicks(siteId, 30),
    getRecentClicks(siteId, 20),
    countProducts({ siteId, status: "active" }),
  ]);

  // CTR estimate: clicks / (products * 30 days * ~100 impressions/product/day)
  const estimatedImpressions30d = totalProducts * 30 * 100;
  const ctr30d = estimatedImpressions30d > 0 ? (clicks30d / estimatedImpressions30d) * 100 : 0;

  // Revenue estimates
  const estRevenue30d = clicks30d * EST_REVENUE_PER_CLICK;
  const estRevenue7d = clicks7d * EST_REVENUE_PER_CLICK;

  // Total referrer clicks for percentage calculation
  const totalReferrerClicks = topReferrers.reduce((sum, r) => sum + r.click_count, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Analytics</h1>
      <p className="mb-8 text-sm text-gray-500">
        Affiliate click data for{" "}
        <span className="font-medium">{session.activeSiteName ?? session.activeSiteSlug}</span>
      </p>

      {/* Summary cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today" value={clicksToday} />
        <StatCard label="Last 7 days" value={clicks7d} />
        <StatCard label="Last 30 days" value={clicks30d} />
        <StatCard label="All time" value={clicksAllTime} />
      </div>

      {/* Revenue & CTR cards */}
      <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Revenue and CTR figures are estimates based on an assumed ${EST_REVENUE_PER_CLICK}/click rate and ~100 impressions/product/day. Actual results will vary. Configure the per-click rate in your site definition.
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Est. Revenue (30d)</p>
          <p className="mt-1 text-3xl font-bold text-green-700">${estRevenue30d.toFixed(2)}</p>
          <p className="mt-1 text-xs text-gray-400">@ ${EST_REVENUE_PER_CLICK}/click</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Est. Revenue (7d)</p>
          <p className="mt-1 text-3xl font-bold text-green-700">${estRevenue7d.toFixed(2)}</p>
          <p className="mt-1 text-xs text-gray-400">@ ${EST_REVENUE_PER_CLICK}/click</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Est. CTR (30d)</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{ctr30d.toFixed(2)}%</p>
          <p className="mt-1 text-xs text-gray-400">{clicks30d} clicks / ~{estimatedImpressions30d.toLocaleString()} impressions</p>
        </div>
      </div>

      {/* Conversion Funnel */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Conversion Funnel (30d)</h2>
        <div className="flex items-center gap-2">
          <FunnelStep label="Active Products" value={totalProducts} width={100} color="bg-blue-500" />
          <FunnelArrow />
          <FunnelStep label="Impressions (est.)" value={estimatedImpressions30d} width={80} color="bg-indigo-500" />
          <FunnelArrow />
          <FunnelStep label="Clicks" value={clicks30d} width={60} color="bg-purple-500" />
          <FunnelArrow />
          <FunnelStep label="Revenue (est.)" value={`$${estRevenue30d.toFixed(0)}`} width={40} color="bg-green-500" />
        </div>
      </section>

      {/* Click trend chart */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Clicks — Last 30 Days</h2>
        <ClickChart data={dailyClicks} />
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Top products with CTR */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Clicked Products</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">No click data yet</p>
          ) : (
            <ExpandableTable rows={topProducts.length} initialLimit={10}>
              {(limit) => (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="pb-2 font-medium">Product</th>
                      <th className="pb-2 text-right font-medium">Clicks</th>
                      <th className="pb-2 text-right font-medium">Est. Rev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProducts.slice(0, limit).map((p, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 text-gray-900">{p.product_name}</td>
                        <td className="py-2 text-right font-medium text-gray-700">{p.click_count}</td>
                        <td className="py-2 text-right text-green-700">${(p.click_count * EST_REVENUE_PER_CLICK).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </ExpandableTable>
          )}
        </section>

        {/* Top referrers with percentages */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Referring Pages</h2>
          {topReferrers.length === 0 ? (
            <p className="text-sm text-gray-400">No referrer data yet</p>
          ) : (
            <ExpandableTable rows={topReferrers.length} initialLimit={10}>
              {(limit) => (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-gray-500">
                      <th className="pb-2 font-medium">Referrer</th>
                      <th className="pb-2 text-right font-medium">Clicks</th>
                      <th className="pb-2 text-right font-medium">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topReferrers.slice(0, limit).map((r, i) => {
                      const pct = totalReferrerClicks > 0 ? (r.click_count / totalReferrerClicks) * 100 : 0;
                      return (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="max-w-[200px] truncate py-2 text-gray-900">{r.referrer}</td>
                          <td className="py-2 text-right font-medium text-gray-700">{r.click_count}</td>
                          <td className="py-2 text-right text-gray-500">{pct.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ExpandableTable>
          )}
        </section>
      </div>

      {/* Top content driving clicks */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Content Driving Clicks (30d)</h2>
        {topContent.length === 0 ? (
          <p className="text-sm text-gray-400">No content click data yet</p>
        ) : (
          <ExpandableTable rows={topContent.length} initialLimit={10}>
            {(limit) => (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-gray-500">
                    <th className="pb-2 font-medium">Content Page</th>
                    <th className="pb-2 text-right font-medium">Clicks</th>
                    <th className="pb-2 text-right font-medium">% of Total</th>
                    <th className="pb-2 text-right font-medium">Est. Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {topContent.slice(0, limit).map((c, i) => {
                    const pct = clicks30d > 0 ? (c.click_count / clicks30d) * 100 : 0;
                    return (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="max-w-[300px] truncate py-2 text-gray-900">{c.content_slug}</td>
                        <td className="py-2 text-right font-medium text-gray-700">{c.click_count}</td>
                        <td className="py-2 text-right text-gray-500">{pct.toFixed(1)}%</td>
                        <td className="py-2 text-right text-green-700">${(c.click_count * EST_REVENUE_PER_CLICK).toFixed(2)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </ExpandableTable>
        )}
      </section>

      {/* Recent clicks */}
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Recent Clicks</h2>
        {recentClicks.length === 0 ? (
          <p className="text-sm text-gray-400">No clicks recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Referrer</th>
                  <th className="pb-2 text-right font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentClicks.map((click) => (
                  <tr key={click.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-900">{click.product_name}</td>
                    <td className="py-2 text-gray-600">{click.content_slug || "—"}</td>
                    <td className="max-w-[200px] truncate py-2 text-gray-600">
                      {click.referrer || "—"}
                    </td>
                    <td className="py-2 text-right text-gray-400">
                      <LocalTime dateTime={click.created_at} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
    </div>
  );
}

function FunnelStep({ label, value, width, color }: { label: string; value: number | string; width: number; color: string }) {
  return (
    <div className="flex-1 text-center">
      <div className={`mx-auto h-2 rounded-full ${color}`} style={{ width: `${width}%` }} />
      <p className="mt-2 text-lg font-bold text-gray-900">{typeof value === "number" ? value.toLocaleString() : value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function FunnelArrow() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
