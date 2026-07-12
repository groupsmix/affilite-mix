// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import Link from "next/link";
// redirect removed — no-site case now renders an inline empty state

import { getDailyClicks } from "@/lib/dal/affiliate-clicks";
import { getDashboardStats, type DashboardStats } from "@/lib/dal/dashboard-stats";
import { countContent } from "@/lib/dal/content";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

import { PageHeader } from "@/components/admin/page-header";

import { requireAdminSession } from "./components/admin-guard";
import { AdminDataError, safeAdminData } from "./components/admin-page-state";
import { AutoRefresh } from "./components/auto-refresh";
import {
  NeedsAttentionCard,
  type DashboardAttention,
} from "./components/dashboard/needs-attention-card";
import { QuickActions } from "./components/dashboard/quick-actions";
import { SiteSetupChecklist } from "./components/dashboard/site-setup-checklist";
import { CardErrorBoundary } from "./components/dashboard/card-error-boundary";
import { KpiCard } from "./components/dashboard/kpi-card";
import {
  CountUpValue,
  PowerReserveMeter,
  Sparkline,
} from "./components/dashboard/dashboard-motion";
import { NicheHealthCard } from "./components/dashboard/niche-health-card";
import { RevenuePerSiteCard } from "./components/dashboard/revenue-per-site-card";
import { ReviewQueueCard } from "./components/dashboard/review-queue-card";
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

const EMPTY_DASHBOARD_STATS: DashboardStats = {
  total_products: 0,
  active_products: 0,
  draft_products: 0,
  total_content: 0,
  published_content: 0,
  draft_content: 0,
  clicks_today: 0,
  clicks_7d: 0,
  products_no_url: 0,
  content_no_products: 0,
  scheduled_content: 0,
};

export default async function AdminDashboard() {
  const session = await requireAdminSession();
  const isSuperAdmin = session.role === "super_admin";

  if (!session.activeSiteSlug) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
        <h2 className="text-xl font-semibold">No site selected</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Pick a site from the Sites page to load your dashboard.
        </p>
        <Link
          href="/q7m-k4j9/sites"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
        >
          Go to Sites
        </Link>
      </div>
    );
  }

  const activeSiteSlug = session.activeSiteSlug;
  const siteIdResult = await safeAdminData(
    "dashboard active site resolution",
    () => resolveDbSiteId(activeSiteSlug),
    "",
  );
  if (siteIdResult.error || !siteIdResult.data) {
    return (
      <AdminDataError
        title="Active site could not load"
        description="WristNerd is selected, but the dashboard could not resolve its database site row. Re-select the site or run the site provisioning migration."
        retryHref="/q7m-k4j9"
      />
    );
  }
  const dbSiteId = siteIdResult.data;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Single RPC call for all aggregate counts + the daily series for the chart.
  // If analytics tables/RPCs are temporarily unavailable, render zeros/empty charts
  // instead of tripping the whole admin error boundary.
  const metricsResult = await safeAdminData(
    "dashboard metrics",
    () =>
      Promise.all([
        getDashboardStats(dbSiteId, todayStart, sevenDaysAgo),
        getDailyClicks(dbSiteId, 7),
      ]),
    [EMPTY_DASHBOARD_STATS, []] as [DashboardStats, { date: string; count: number }[]],
  );
  const [stats, dailyClicks] = metricsResult.data;

  const reviewCountResult = await safeAdminData(
    "dashboard review count",
    () => countContent({ siteId: dbSiteId, status: "review" }),
    0,
  );
  const reviewCount = reviewCountResult.data;

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

  // Work queue — items that need an admin review before they go live.
  const attention: DashboardAttention[] = [];
  if (productsNoUrl > 0) {
    attention.push({
      type: "warning",
      count: productsNoUrl,
      message: "Active products missing affiliate URL",
      href: "/q7m-k4j9/products?missing_url=1",
    });
  }
  if (contentWithNoProducts > 0) {
    attention.push({
      type: "warning",
      count: contentWithNoProducts,
      message: "Published content with no linked products",
      href: "/q7m-k4j9/content",
    });
  }
  if (scheduledContent > 0) {
    attention.push({
      type: "info",
      count: scheduledContent,
      message: "Content scheduled for future publishing",
      href: "/q7m-k4j9/content?status=scheduled",
    });
  }
  if (reviewCount > 0) {
    attention.push({
      type: "info",
      count: reviewCount,
      message: "Content waiting for review",
      href: "/q7m-k4j9/content?f.status=review",
    });
  }
  if (draftContent > 0) {
    attention.push({
      type: "info",
      count: draftContent,
      message: "Draft content waiting to be published",
      href: "/q7m-k4j9/content",
    });
  }
  if (draftProducts > 0) {
    attention.push({
      type: "info",
      count: draftProducts,
      message: "Draft products not yet active",
      href: "/q7m-k4j9/products",
    });
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <AutoRefresh intervalMs={60_000} />

      {metricsResult.error ? (
        <div className="mb-6">
          <AdminDataError
            title="Dashboard data is partially unavailable"
            description="Some database queries failed, so the dashboard is showing safe empty values instead of crashing."
            retryHref="/q7m-k4j9"
          />
        </div>
      ) : null}

      <PageHeader
        title="Dashboard"
        description={
          <>
            Managing:{" "}
            <span className="font-medium text-foreground">
              {session.activeSiteName ?? activeSiteSlug}
            </span>
          </>
        }
        actions={<PowerReserveMeter value={platformHealth} />}
      />

      <QuickActions />

      <CardErrorBoundary title="Site setup">
        <SiteSetupChecklist siteId={dbSiteId} />
      </CardErrorBoundary>

      {/* Section 1 — KPI grid. 1 col on sm, 2 on md, 4 on xl. */}
      <div aria-live="polite" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link href="/q7m-k4j9/analytics" className="block">
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
        </Link>
        <Link href="/q7m-k4j9/analytics" className="block">
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
        </Link>
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
                  href: "/q7m-k4j9/products?missing_url=1",
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
                  href: "/q7m-k4j9/content?status=scheduled",
                  label: `${scheduledContent} scheduled`,
                }
              : null
          }
        />
      </div>

      {/* Section 2–3 — Trend and work queue. Trend spans 2 columns on xl. */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendCard data={dailyClicks} totalClicks7d={clicks7d} />
        </div>
        <NeedsAttentionCard items={attention} />
      </div>

      {/* Section 4 — Top products, scheduled content, and pending review. */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <TopProductsCard siteId={dbSiteId} sevenDaysAgo={sevenDaysAgo} />
        <ScheduledContentCard siteId={dbSiteId} />
        <ReviewQueueCard siteId={dbSiteId} count={reviewCount} />
      </div>

      {/* Section 5 (super_admin only) — cross-site niche health + revenue.
          Both rely on `listSites()` so we gate both behind super_admin. */}
      {isSuperAdmin && (
        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <CardErrorBoundary title="Niche health">
            <NicheHealthCard />
          </CardErrorBoundary>
          <CardErrorBoundary title="Estimated revenue (7d)">
            <RevenuePerSiteCard sevenDaysAgo={sevenDaysAgo} />
          </CardErrorBoundary>
        </div>
      )}
    </div>
  );
}
