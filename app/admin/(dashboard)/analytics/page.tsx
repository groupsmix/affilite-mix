import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import {
  getClickCount,
  getRecentClicks,
  getTopProducts,
  getTopReferrers,
  getDailyClicks,
} from "@/lib/dal/affiliate-clicks";
import { redirect } from "next/navigation";
import { ClickChart } from "./click-chart";

export default async function AnalyticsPage() {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const siteId = await resolveDbSiteId(session.activeSiteSlug);

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
    dailyClicks,
    recentClicks,
  ] = await Promise.all([
    getClickCount(siteId, todayStart),
    getClickCount(siteId, sevenDaysAgo),
    getClickCount(siteId, thirtyDaysAgo),
    getClickCount(siteId),
    getTopProducts(siteId, thirtyDaysAgo, 10),
    getTopReferrers(siteId, thirtyDaysAgo, 10),
    getDailyClicks(siteId, 30),
    getRecentClicks(siteId, 20),
  ]);

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

      {/* Click trend chart */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Clicks — Last 30 Days</h2>
        <ClickChart data={dailyClicks} />
      </section>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Top products */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Clicked Products</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">No click data yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 text-right font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.map((p, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 text-gray-900">{p.product_name}</td>
                    <td className="py-2 text-right font-medium text-gray-700">{p.click_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Top referrers */}
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Top Referring Pages</h2>
          {topReferrers.length === 0 ? (
            <p className="text-sm text-gray-400">No referrer data yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-gray-500">
                  <th className="pb-2 font-medium">Referrer</th>
                  <th className="pb-2 text-right font-medium">Clicks</th>
                </tr>
              </thead>
              <tbody>
                {topReferrers.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="max-w-[200px] truncate py-2 text-gray-900">{r.referrer}</td>
                    <td className="py-2 text-right font-medium text-gray-700">{r.click_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

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
                      {new Date(click.created_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
