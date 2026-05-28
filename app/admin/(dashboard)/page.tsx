// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import { redirect } from "next/navigation";

import { getDailyClicks } from "@/lib/dal/affiliate-clicks";
import { getDashboardStats } from "@/lib/dal/dashboard-stats";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

import { PageHeader } from "@/components/admin/page-header";

import { requireAdminSession } from "./components/admin-guard";
import { AutoRefresh } from "./components/auto-refresh";
import { AlertsCard, type DashboardAlert } from "./components/dashboard/alerts-card";
import { KpiCard } from "./components/dashboard/kpi-card";
import {
  CountUpValue,
  PowerReserveMeter,
  Sparkline,
} from "./components/dashboard/dashboard-motion";
import { NicheHealthCard } from "./components/dashboard/niche-health-card";
import { RevenuePerSiteCard } from "./components/dashboard/revenue-per-site-card";
import { ScheduledContentCard } from "./components/dashboard/scheduled-content-card";
import { TopProductsCard } from "./components/dashboard/top-products-card";
import { TrendCard } from "./components/dashboard/trend-card";

/**
 * Percent change between two counts, capped at ±999 % so we never render
 * `Infinity%` when the comparison window had zero clicks.
 */
function pctDelta(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  const pct = ((current - previous) / previous) * 100;
  if (pct > 999) return 999;
  if (pct < -999) return -999;
  return pct;
}

export default async function AdminDashboard() {
  const session = await requireAdminSession();
  const isSuperAdmin = session.role === "super_admin";

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const dbSiteId = await resolveDbSiteId(session.activeSiteSlug);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Single RPC call for all aggregate counts + the daily series for the chart.
  // Top-products / scheduled-content are fetched inside their own Cards so
  // they can Suspense-boundary independently if we add streaming later.
  const [stats, dailyClicks] = await Promise.all([
    getDashboardStats(dbSiteId, todayStart, sevenDaysAgo),
    getDailyClicks(dbSiteId, 7),
  ]);

  const {
    active_products: activeProducts,
    total_content: totalContent,
    published_content: publishedContent,
    draft_content: draftContent,
    clicks_today: clicksToday,
    clicks_7d: clicks7d,
    products_no_url: productsNoUrl,
    content_no_products: contentWithNoProducts,
    scheduled_content: scheduledContent,
    draft_products: draftProducts,
  } = stats;

  // Average daily clicks across the last 7 days — used as the comparison
  // baseline for the "Clicks (today)" KPI delta badge. Keeps the signal
  // simple: "is today tracking above or below a typical day?"
  const avgDailyClicks = clicks7d / 7;
  const todayDelta = pctDelta(clicksToday, avgDailyClicks);

  // Daily series for the KPI sparkline (oldest → newest).
  const clickSeries = dailyClicks.map((d) => d.count);

  // Operational "power reserve": a single 0–100 health score derived from
  // real signals so the gold complication in the header reflects work that
  // actually needs doing. Each unresolved issue draws the reserve down.
  let health = 100;
  health -= Math.min(productsNoUrl * 4, 30);
  health -= Math.min(contentWithNoProducts * 3, 20);
  health -= Math.min(draftProducts * 2, 12);
  health -= Math.min(draftContent, 8);
  if (activeProducts === 0) health -= 25;
  if (publishedContent === 0) health -= 15;
  const platformHealth = Math.max(0, Math.min(100, health));

  // Alerts / warnings — copy preserved verbatim from the previous dashboard
  // so existing QA checklists still match.
  const alerts: DashboardAlert[] = [];
  if (productsNoUrl > 0) {
    alerts.push({
      type: "warning",
      message: `${productsNoUrl} active product(s) missing affiliate URL`,
      href: "/admin/products?missing_url=1",
    });
  }
  if (contentWithNoProducts > 0) {
    alerts.push({
      type: "warning",
      message: `${contentWithNoProducts} published content item(s) with no linked products`,
      href: "/admin/content",
    });
  }
  if (scheduledContent > 0) {
    alerts.push({
      type: "info",
      message: `${scheduledContent} content item(s) scheduled for future publishing`,
      href: "/admin/content?status=scheduled",
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

  return (
    <div className="mx-auto w-full max-w-7xl">
      <AutoRefresh intervalMs={60_000} />

      <PageHeader
        title="Dashboard"
        description={
          <>
            Managing:{" "}
            <span className="font-medium text-foreground">
              {session.activeSiteName ?? session.activeSiteSlug}
            </span>
          </>
        }
        actions={<PowerReserveMeter value={platformHealth} />}
      />

      {/* Section 1 — KPI grid. 1 col on sm, 2 on md, 4 on xl. */}
      <div aria-live="polite" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Clicks (today)"
          value={<CountUpValue value={clicksToday} />}
          description={`Baseline: ${avgDailyClicks.toFixed(1)}/day average over last 7 days.`}
          delta={
            avgDailyClicks > 0 || clicksToday > 0
              ? { valuePct: todayDelta, label: "Change vs. 7d average" }
              : null
          }
        />
        <KpiCard
          title="Clicks (7d)"
          value={<CountUpValue value={clicks7d} />}
          description="Total affiliate-link clicks across the last 7 days."
          chart={
            clickSeries.length > 1 ? (
              <Sparkline data={clickSeries} width={240} height={32} className="h-8 w-full" />
            ) : null
          }
        />
        <KpiCard
          title="Active products"
          value={<CountUpValue value={activeProducts} />}
          description={
            draftProducts > 0
              ? `${draftProducts} draft product${draftProducts === 1 ? "" : "s"} not yet active.`
              : "All products are active."
          }
          subLink={
            productsNoUrl > 0
              ? {
                  href: "/admin/products?missing_url=1",
                  label: `${productsNoUrl} missing URL`,
                  tone: "warning",
                }
              : null
          }
        />
        <KpiCard
          title="Published content"
          value={<CountUpValue value={publishedContent} />}
          description={`${totalContent.toLocaleString()} total article${totalContent === 1 ? "" : "s"}.`}
          subLink={
            scheduledContent > 0
              ? {
                  href: "/admin/content?status=scheduled",
                  label: `${scheduledContent} scheduled`,
                }
              : null
          }
        />
      </div>

      {/* Section 2–4 — Trend, top products, scheduled content. Trend
          spans 2 columns on xl so the chart gets room to breathe. */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="xl:col-span-2">
          <TrendCard data={dailyClicks} totalClicks7d={clicks7d} />
        </div>
        <TopProductsCard siteId={dbSiteId} sevenDaysAgo={sevenDaysAgo} />
        <ScheduledContentCard siteId={dbSiteId} />
      </div>

      {/* Section 5 (super_admin only) — cross-site niche health + revenue.
          Both rely on `listSites()` so we gate both behind super_admin. */}
      {isSuperAdmin && (
        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <NicheHealthCard />
          <RevenuePerSiteCard sevenDaysAgo={sevenDaysAgo} />
        </div>
      )}

      {/* Section 6 — Alerts. Kept near the bottom so KPIs load above the
          fold; the existing list + copy is preserved inside `AlertsCard`. */}
      <AlertsCard alerts={alerts} />
    </div>
  );
}
