import { requireAdminSession } from "./components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listProducts } from "@/lib/dal/products";
import { listContent } from "@/lib/dal/content";
import { getClickCount, getTopProducts } from "@/lib/dal/affiliate-clicks";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminDashboard() {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [products, contentItems, clicksToday, clicks7d, topProducts] = await Promise.all([
    listProducts({ siteId: dbSiteId }),
    listContent({ siteId: dbSiteId }),
    getClickCount(dbSiteId, todayStart),
    getClickCount(dbSiteId, sevenDaysAgo),
    getTopProducts(dbSiteId, sevenDaysAgo, 5),
  ]);

  const activeProducts = products.filter((p) => p.status === "active").length;
  const draftProducts = products.filter((p) => p.status === "draft").length;
  const publishedContent = contentItems.filter((c) => c.status === "published").length;
  const draftContent = contentItems.filter((c) => c.status === "draft").length;

  // Alerts / warnings
  const productsWithNoUrl = products.filter((p) => p.status === "active" && !p.affiliate_url);
  const alerts: { type: "warning" | "info"; message: string; href?: string }[] = [];
  if (productsWithNoUrl.length > 0) {
    alerts.push({
      type: "warning",
      message: `${productsWithNoUrl.length} active product(s) missing affiliate URL`,
      href: "/admin/products",
    });
  }
  if (draftContent > 0) {
    alerts.push({
      type: "info",
      message: `${draftContent} draft content item(s) waiting to be published`,
      href: "/admin/content",
    });
  }
  if (draftProducts > 0) {
    alerts.push({
      type: "info",
      message: `${draftProducts} draft product(s) not yet active`,
      href: "/admin/products",
    });
  }

  const quickActions = [
    { title: "New Product", href: "/admin/products/new", icon: "+" },
    { title: "New Article", href: "/admin/content/new", icon: "+" },
    { title: "View Analytics", href: "/admin/analytics", icon: "\u2192" },
    { title: "View Site", href: "/", icon: "\u2197" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mb-6 text-sm text-gray-500">
        Managing: <span className="font-medium">{session.activeSiteName ?? session.activeSiteSlug}</span>
      </p>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((alert, i) => (
            <div
              key={i}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${
                alert.type === "warning"
                  ? "border-yellow-200 bg-yellow-50 text-yellow-800"
                  : "border-blue-200 bg-blue-50 text-blue-800"
              }`}
            >
              <span>
                {alert.type === "warning" ? "⚠ " : "ℹ "}
                {alert.message}
              </span>
              {alert.href && (
                <Link href={alert.href} className="font-medium underline hover:no-underline">
                  View
                </Link>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats cards */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Products</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{products.length}</p>
          <p className="mt-1 text-xs text-gray-400">{activeProducts} active, {draftProducts} draft</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Content</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{contentItems.length}</p>
          <p className="mt-1 text-xs text-gray-400">{publishedContent} published, {draftContent} draft</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Clicks Today</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{clicksToday.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <p className="text-sm text-gray-500">Clicks (7 days)</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{clicks7d.toLocaleString()}</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Quick Actions</h2>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              <span>{action.icon}</span>
              {action.title}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top products */}
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">Top Products (7d)</h2>
          {topProducts.length === 0 ? (
            <p className="text-sm text-gray-400">No click data yet</p>
          ) : (
            <ul className="space-y-2">
              {topProducts.map((p, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{p.product_name}</span>
                  <span className="font-medium text-gray-900">{p.click_count} clicks</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Management sections */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Manage</h2>
          {[
            { title: "Categories", href: "/admin/categories", description: "Organize your products and content" },
            { title: "Products", href: "/admin/products", description: `${products.length} products total` },
            { title: "Content", href: "/admin/content", description: `${contentItems.length} articles total` },
            { title: "Analytics", href: "/admin/analytics", description: "Click tracking & performance" },
          ].map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <h3 className="font-semibold text-gray-900">{card.title}</h3>
              <p className="text-sm text-gray-500">{card.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
