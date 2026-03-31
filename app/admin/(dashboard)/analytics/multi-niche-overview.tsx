import { listSites } from "@/lib/dal/sites";
import { getClickCount } from "@/lib/dal/affiliate-clicks";
import { countProducts } from "@/lib/dal/products";
import { countContent } from "@/lib/dal/content";
import Link from "next/link";

interface NicheStats {
  siteId: string;
  name: string;
  slug: string;
  clicks7d: number;
  clicksToday: number;
  totalProducts: number;
  totalContent: number;
  isActive: boolean;
}

export async function MultiNicheOverview() {
  const sites = await listSites();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const nicheStats: NicheStats[] = await Promise.all(
    sites.map(async (site) => {
      const [clicksToday, clicks7d, totalProducts, totalContent] = await Promise.all([
        getClickCount(site.id, todayStart),
        getClickCount(site.id, sevenDaysAgo),
        countProducts({ siteId: site.id }),
        countContent({ siteId: site.id }),
      ]);

      return {
        siteId: site.id,
        name: site.name,
        slug: site.slug,
        clicks7d,
        clicksToday,
        totalProducts,
        totalContent,
        isActive: site.is_active,
      };
    }),
  );

  const totalClicksToday = nicheStats.reduce((sum, s) => sum + s.clicksToday, 0);
  const totalClicks7d = nicheStats.reduce((sum, s) => sum + s.clicks7d, 0);
  const totalProducts = nicheStats.reduce((sum, s) => sum + s.totalProducts, 0);
  const totalContent = nicheStats.reduce((sum, s) => sum + s.totalContent, 0);

  // Sort by 7d clicks descending
  const sorted = [...nicheStats].sort((a, b) => b.clicks7d - a.clicks7d);

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">All Niches Overview</h2>

      {/* Aggregate stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Sites</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{sites.length}</p>
          <p className="mt-1 text-xs text-gray-400">{sites.filter((s) => s.is_active).length} active</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Clicks (7d)</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totalClicks7d.toLocaleString()}</p>
          <p className="mt-1 text-xs text-gray-400">{totalClicksToday.toLocaleString()} today</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Products</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totalProducts.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Total Content</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{totalContent.toLocaleString()}</p>
        </div>
      </div>

      {/* Per-niche table */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">Niche</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Clicks (7d)</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Today</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Products</th>
              <th className="px-4 py-3 text-right font-medium text-gray-700">Content</th>
              <th className="px-4 py-3 font-medium text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((niche) => (
              <tr key={niche.siteId} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/analytics`}
                    className="font-medium text-gray-900 hover:text-blue-600"
                  >
                    {niche.name}
                  </Link>
                  <p className="text-xs text-gray-400">{niche.slug}</p>
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">
                  {niche.clicks7d.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {niche.clicksToday.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {niche.totalProducts}
                </td>
                <td className="px-4 py-3 text-right text-gray-600">
                  {niche.totalContent}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      niche.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {niche.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
