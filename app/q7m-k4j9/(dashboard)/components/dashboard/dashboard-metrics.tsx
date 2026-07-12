import Link from "next/link";

import { getDashboardStats, type DashboardStats } from "@/lib/dal/dashboard-stats";
import { getDailyClicks } from "@/lib/dal/affiliate-clicks";
import { countContent } from "@/lib/dal/content";
import { AdminDataError, safeAdminData } from "../admin-page-state";
import { KpiCard } from "./kpi-card";
import { CountUpValue, Sparkline } from "./dashboard-motion";
import { TrendCard } from "./trend-card";
import { NeedsAttentionCard, type DashboardAttention } from "./needs-attention-card";

interface DashboardMetricsProps {
  siteId: string;
  todayStart: string;
  sevenDaysAgo: string;
}

function pctDelta(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  const pct = ((current - previous) / previous) * 100;
  if (pct > 999) return 999;
  if (pct < -999) return -999;
  return pct;
}

export async function DashboardMetrics({
  siteId,
  todayStart,
  sevenDaysAgo,
}: DashboardMetricsProps) {
  const metricsResult = await safeAdminData(
    "dashboard metrics",
    () =>
      Promise.all([getDashboardStats(siteId, todayStart, sevenDaysAgo), getDailyClicks(siteId, 7)]),
    [
      {
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
      },
      [],
    ] as [DashboardStats, { date: string; count: number }[]],
  );

  const [stats, dailyClicks] = metricsResult.data;

  const reviewCountResult = await safeAdminData(
    "dashboard review count",
    () => countContent({ siteId, status: "review" }),
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

  const avgDailyClicks = clicks7d / 7;
  const todayDelta = pctDelta(clicksToday, avgDailyClicks);
  const clickSeries = dailyClicks.map((d) => d.count);

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
    <>
      {metricsResult.error ? (
        <div className="mb-6">
          <AdminDataError
            title="Dashboard data is partially unavailable"
            description="Some database queries failed, so the dashboard is showing safe empty values instead of crashing."
            retryHref="/q7m-k4j9"
          />
        </div>
      ) : null}

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

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <TrendCard data={dailyClicks} totalClicks7d={clicks7d} />
        </div>
        <NeedsAttentionCard items={attention} />
      </div>
    </>
  );
}
