// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import { Suspense } from "react";
import Link from "next/link";
// redirect removed — no-site case now renders an inline empty state

import { resolveDbSiteId } from "@/lib/dal/site-resolver";

import { PageHeader } from "@/components/admin/page-header";

import { requireAdminSession } from "./components/admin-guard";
import { AdminDataError } from "./components/admin-page-state";
import { AutoRefresh } from "./components/auto-refresh";
import { QuickActions } from "./components/dashboard/quick-actions";
import { CardErrorBoundary } from "./components/dashboard/card-error-boundary";
import { DashboardHealth } from "./components/dashboard/dashboard-health";
import { DashboardMetrics } from "./components/dashboard/dashboard-metrics";
import {
  DashboardMetricsSkeleton,
  DashboardCardSkeleton,
  DashboardHealthSkeleton,
} from "./components/dashboard/dashboard-skeletons";
import { NicheHealthCard } from "./components/dashboard/niche-health-card";
import { RevenuePerSiteCard } from "./components/dashboard/revenue-per-site-card";
import { ReviewQueueCard } from "./components/dashboard/review-queue-card";
import { ScheduledContentCard } from "./components/dashboard/scheduled-content-card";
import { SiteSetupChecklist } from "./components/dashboard/site-setup-checklist";
import { TopProductsCard } from "./components/dashboard/top-products-card";

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
  let dbSiteId: string;
  try {
    const resolved = await resolveDbSiteId(activeSiteSlug);
    if (!resolved) {
      throw new Error("Active site could not be resolved");
    }
    dbSiteId = resolved;
  } catch {
    return (
      <AdminDataError
        title="Active site could not load"
        description="WristNerd is selected, but the dashboard could not resolve its database site row. Re-select the site or run the site provisioning migration."
        retryHref="/q7m-k4j9"
      />
    );
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  return (
    <div className="mx-auto w-full max-w-7xl">
      <AutoRefresh intervalMs={60_000} />

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
        actions={
          <Suspense fallback={<DashboardHealthSkeleton />}>
            <DashboardHealth
              siteId={dbSiteId}
              todayStart={todayStart}
              sevenDaysAgo={sevenDaysAgo}
            />
          </Suspense>
        }
      />

      <QuickActions />

      <CardErrorBoundary title="Site setup">
        <Suspense fallback={<DashboardCardSkeleton />}>
          <SiteSetupChecklist siteId={dbSiteId} />
        </Suspense>
      </CardErrorBoundary>

      <Suspense fallback={<DashboardMetricsSkeleton />}>
        <DashboardMetrics siteId={dbSiteId} todayStart={todayStart} sevenDaysAgo={sevenDaysAgo} />
      </Suspense>

      {/* Section 4 — Top products, scheduled content, and pending review. */}
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Suspense fallback={<DashboardCardSkeleton />}>
          <TopProductsCard siteId={dbSiteId} sevenDaysAgo={sevenDaysAgo} />
        </Suspense>
        <Suspense fallback={<DashboardCardSkeleton />}>
          <ScheduledContentCard siteId={dbSiteId} />
        </Suspense>
        <Suspense fallback={<DashboardCardSkeleton />}>
          <ReviewQueueCard siteId={dbSiteId} />
        </Suspense>
      </div>

      {/* Section 5 (super_admin only) — cross-site niche health + revenue.
          Both rely on `listSites()` so we gate both behind super_admin. */}
      {isSuperAdmin && (
        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <CardErrorBoundary title="Niche health">
            <Suspense fallback={<DashboardCardSkeleton />}>
              <NicheHealthCard />
            </Suspense>
          </CardErrorBoundary>
          <CardErrorBoundary title="Estimated revenue (7d)">
            <Suspense fallback={<DashboardCardSkeleton />}>
              <RevenuePerSiteCard sevenDaysAgo={sevenDaysAgo} />
            </Suspense>
          </CardErrorBoundary>
        </div>
      )}
    </div>
  );
}
