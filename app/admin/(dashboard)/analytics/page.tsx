// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import { redirect } from "next/navigation";

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
import { getAdImpressionStats } from "@/lib/dal/ad-impressions";
import { getSiteById } from "@/config/sites";
import {
  resolveAnalyticsRange,
  rangeLabel,
  type AnalyticsRangeSearchParams,
} from "@/lib/analytics/range";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "../components/dashboard/kpi-card";

import { ClickChart } from "./click-chart";
import { ExpandableTable } from "./expandable-table";
import { LocalTime } from "./local-time";
import { MultiNicheOverview } from "./multi-niche-overview";
import { RangeSelector } from "./range-selector";

/** Default estimated revenue per click (USD). Overridden by site config. */
const DEFAULT_EST_REVENUE_PER_CLICK = 0.35;

/** Upper bound used to derive the "unique referrers" KPI from getTopReferrers. */
const UNIQUE_REFERRER_SAMPLE_LIMIT = 100;

interface AnalyticsPageProps {
  searchParams?: Promise<AnalyticsRangeSearchParams> | AnalyticsRangeSearchParams;
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const isSuperAdmin = session.role === "super_admin";
  const siteId = await resolveDbSiteId(session.activeSiteSlug);
  const siteConfig = getSiteById(session.activeSiteSlug);

  /**
   * EPC resolution (kept identical to the previous page): per-site static
   * config first, then the constant default. The DB fallback is handled
   * separately by `lib/dal/revenue-per-site.ts` for the super-admin
   * overview and is not re-resolved here.
   */
  const EST_REVENUE_PER_CLICK = siteConfig?.estRevenuePerClick ?? DEFAULT_EST_REVENUE_PER_CLICK;

  const resolvedParams = (await searchParams) ?? {};
  const range = resolveAnalyticsRange(resolvedParams);
  const adsConfigured =
    siteConfig?.monetizationType === "ads" || siteConfig?.monetizationType === "both";

  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [
    clicksInRange,
    referrersInRange,
    adImpressionStats,
    topProducts,
    topReferrers,
    topContent,
    dailyClicks,
    recentClicks,
    totalProducts,
    clicks30d,
  ] = await Promise.all([
    getClickCount(siteId, range.fromIso),
    getTopReferrers(siteId, range.fromIso, UNIQUE_REFERRER_SAMPLE_LIMIT),
    adsConfigured
      ? getAdImpressionStats(siteId, range.fromIso)
      : Promise.resolve([] as Awaited<ReturnType<typeof getAdImpressionStats>>),
    // Sections below the KPI row are deferred to 17.6+ — keep their
    // existing 30d windows so output is at parity with today.
    getTopProducts(siteId, thirtyDaysAgoIso, 50),
    getTopReferrers(siteId, thirtyDaysAgoIso, 50),
    getTopContentSlugs(siteId, thirtyDaysAgoIso, 50),
    getDailyClicks(siteId, 30),
    getRecentClicks(siteId, 20),
    countProducts({ siteId, status: "active" }),
    getClickCount(siteId, thirtyDaysAgoIso),
  ]);

  const uniqueReferrers = referrersInRange.length;
  const estRevenueInRange = clicksInRange * EST_REVENUE_PER_CLICK;
  const totalAdImpressions = adImpressionStats.reduce((sum, s) => sum + s.total_impressions, 0);
  const totalReferrerClicks = topReferrers.reduce((sum, r) => sum + r.click_count, 0);
  const estRevenue30d = clicks30d * EST_REVENUE_PER_CLICK;
  const rangeLabelText = rangeLabel(range);

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Analytics"
        description={
          <>
            Affiliate click data for{" "}
            <span className="font-medium text-foreground">
              {session.activeSiteName ?? session.activeSiteSlug}
            </span>
          </>
        }
        actions={<RangeSelector />}
      />

      {/* Multi-niche overview for super_admin */}
      {isSuperAdmin && <MultiNicheOverview />}

      {/* Section 1 — KPI grid. 1 col on sm, 2 on md, 4 on xl. */}
      <div aria-live="polite" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={`Clicks (${rangeLabelText.toLowerCase()})`}
          value={clicksInRange.toLocaleString()}
          description={`Total affiliate-link clicks in the selected window.`}
        />
        <KpiCard
          title="Unique referrers"
          value={uniqueReferrers.toLocaleString()}
          description={
            uniqueReferrers >= UNIQUE_REFERRER_SAMPLE_LIMIT
              ? `Top ${UNIQUE_REFERRER_SAMPLE_LIMIT} sampled — actual count may be higher.`
              : "Distinct referring pages seen in this window."
          }
        />
        <KpiCard
          title="Est. revenue"
          value={`$${estRevenueInRange.toFixed(2)}`}
          description={`${clicksInRange.toLocaleString()} clicks × $${EST_REVENUE_PER_CLICK.toFixed(2)}/click.`}
        />
        {adsConfigured ? (
          <KpiCard
            title="Ad impressions"
            value={totalAdImpressions.toLocaleString()}
            description={
              adImpressionStats.length > 0
                ? `${adImpressionStats.length} placement${adImpressionStats.length === 1 ? "" : "s"} tracked in window.`
                : "No ad impressions recorded in this window."
            }
          />
        ) : (
          <KpiCard
            title="Active products"
            value={totalProducts.toLocaleString()}
            description="Products currently active across this site."
          />
        )}
      </div>

      {/* Revenue disclaimer — kept verbatim so QA copy checks still match. */}
      <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
        Revenue figures are estimates based on an assumed ${EST_REVENUE_PER_CLICK.toFixed(2)}/click
        rate. Actual results will vary. Configure the per-click rate in your site definition.
      </div>

      {/* Click trend chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Clicks — Last 30 Days</CardTitle>
          <CardDescription>Daily affiliate-link clicks across the last 30 days.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClickChart data={dailyClicks} />
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {/* Top products with CTR */}
        <Card>
          <CardHeader>
            <CardTitle>Top Clicked Products</CardTitle>
            <CardDescription>Last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No click data yet</p>
            ) : (
              <ExpandableTable rows={topProducts.length} initialLimit={10}>
                {(limit) => (
                  <>
                    {/* Mobile cards */}
                    <div className="grid gap-2 sm:hidden">
                      {topProducts.slice(0, limit).map((p, i) => (
                        <div key={i} className="rounded-lg border border-border p-3">
                          <p className="font-medium text-foreground">{p.product_name}</p>
                          <div className="mt-1 flex items-center gap-3 text-sm">
                            <span className="text-muted-foreground">{p.click_count} clicks</span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              ${(p.click_count * EST_REVENUE_PER_CLICK).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Desktop table */}
                    <table className="hidden w-full text-sm sm:table">
                      <thead>
                        <tr className="border-b border-border text-start text-muted-foreground">
                          <th className="pb-2 font-medium">Product</th>
                          <th className="pb-2 text-end font-medium">Clicks</th>
                          <th className="pb-2 text-end font-medium">Est. Rev</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topProducts.slice(0, limit).map((p, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 text-foreground">{p.product_name}</td>
                            <td className="py-2 text-end font-medium text-foreground">
                              {p.click_count}
                            </td>
                            <td className="py-2 text-end text-emerald-700 dark:text-emerald-400">
                              ${(p.click_count * EST_REVENUE_PER_CLICK).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </ExpandableTable>
            )}
          </CardContent>
        </Card>

        {/* Top referrers with percentages */}
        <Card>
          <CardHeader>
            <CardTitle>Top Referring Pages</CardTitle>
            <CardDescription>Last 30 days.</CardDescription>
          </CardHeader>
          <CardContent>
            {topReferrers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referrer data yet</p>
            ) : (
              <ExpandableTable rows={topReferrers.length} initialLimit={10}>
                {(limit) => (
                  <>
                    {/* Mobile cards */}
                    <div className="grid gap-2 sm:hidden">
                      {topReferrers.slice(0, limit).map((r, i) => {
                        const pct =
                          totalReferrerClicks > 0 ? (r.click_count / totalReferrerClicks) * 100 : 0;
                        return (
                          <div key={i} className="rounded-lg border border-border p-3">
                            <p className="truncate font-medium text-foreground">{r.referrer}</p>
                            <div className="mt-1 flex items-center gap-3 text-sm">
                              <span className="text-muted-foreground">{r.click_count} clicks</span>
                              <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Desktop table */}
                    <table className="hidden w-full text-sm sm:table">
                      <thead>
                        <tr className="border-b border-border text-start text-muted-foreground">
                          <th className="pb-2 font-medium">Referrer</th>
                          <th className="pb-2 text-end font-medium">Clicks</th>
                          <th className="pb-2 text-end font-medium">%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {topReferrers.slice(0, limit).map((r, i) => {
                          const pct =
                            totalReferrerClicks > 0
                              ? (r.click_count / totalReferrerClicks) * 100
                              : 0;
                          return (
                            <tr key={i} className="border-b border-border/50">
                              <td className="max-w-[200px] truncate py-2 text-foreground">
                                {r.referrer}
                              </td>
                              <td className="py-2 text-end font-medium text-foreground">
                                {r.click_count}
                              </td>
                              <td className="py-2 text-end text-muted-foreground">
                                {pct.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                )}
              </ExpandableTable>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top content driving clicks */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Top Content Driving Clicks (30d)</CardTitle>
        </CardHeader>
        <CardContent>
          {topContent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No content click data yet</p>
          ) : (
            <ExpandableTable rows={topContent.length} initialLimit={10}>
              {(limit) => (
                <>
                  {/* Mobile cards */}
                  <div className="grid gap-2 sm:hidden">
                    {topContent.slice(0, limit).map((c, i) => {
                      const pct = clicks30d > 0 ? (c.click_count / clicks30d) * 100 : 0;
                      return (
                        <div key={i} className="rounded-lg border border-border p-3">
                          <p className="truncate font-medium text-foreground">{c.content_slug}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                            <span className="text-muted-foreground">{c.click_count} clicks</span>
                            <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                            <span className="text-emerald-700 dark:text-emerald-400">
                              ${(c.click_count * EST_REVENUE_PER_CLICK).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Desktop table */}
                  <table className="hidden w-full text-sm sm:table">
                    <thead>
                      <tr className="border-b border-border text-start text-muted-foreground">
                        <th className="pb-2 font-medium">Content Page</th>
                        <th className="pb-2 text-end font-medium">Clicks</th>
                        <th className="pb-2 text-end font-medium">% of Total</th>
                        <th className="pb-2 text-end font-medium">Est. Rev</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topContent.slice(0, limit).map((c, i) => {
                        const pct = clicks30d > 0 ? (c.click_count / clicks30d) * 100 : 0;
                        return (
                          <tr key={i} className="border-b border-border/50">
                            <td className="max-w-[300px] truncate py-2 text-foreground">
                              {c.content_slug}
                            </td>
                            <td className="py-2 text-end font-medium text-foreground">
                              {c.click_count}
                            </td>
                            <td className="py-2 text-end text-muted-foreground">
                              {pct.toFixed(1)}%
                            </td>
                            <td className="py-2 text-end text-emerald-700 dark:text-emerald-400">
                              ${(c.click_count * EST_REVENUE_PER_CLICK).toFixed(2)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </>
              )}
            </ExpandableTable>
          )}
        </CardContent>
      </Card>

      {/* Ad Impression Stats — shown when ads monetization is configured
          and there is data for the selected window. */}
      {adsConfigured && adImpressionStats.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Ad Impressions ({rangeLabelText.toLowerCase()})</CardTitle>
            <CardDescription>
              Total impressions: {totalAdImpressions.toLocaleString()} across{" "}
              {adImpressionStats.length} placement
              {adImpressionStats.length === 1 ? "" : "s"}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Mobile cards */}
            <div className="grid gap-2 sm:hidden">
              {adImpressionStats.map((stat) => (
                <div key={stat.ad_placement_id} className="rounded-lg border border-border p-3">
                  <p className="truncate font-mono text-xs text-foreground">
                    {stat.ad_placement_id}
                  </p>
                  <p className="mt-1 text-sm font-medium text-foreground">
                    {stat.total_impressions.toLocaleString()} impressions
                  </p>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <table className="hidden w-full text-sm sm:table">
              <thead>
                <tr className="border-b border-border text-start text-muted-foreground">
                  <th className="pb-2 font-medium">Placement ID</th>
                  <th className="pb-2 text-end font-medium">Impressions</th>
                </tr>
              </thead>
              <tbody>
                {adImpressionStats.map((stat) => (
                  <tr key={stat.ad_placement_id} className="border-b border-border/50">
                    <td className="py-2 font-mono text-xs text-foreground">
                      {stat.ad_placement_id}
                    </td>
                    <td className="py-2 text-end font-medium text-foreground">
                      {stat.total_impressions.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Recent clicks */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Clicks</CardTitle>
          <CardDescription>Most recent affiliate-link clicks for this site.</CardDescription>
        </CardHeader>
        <CardContent>
          {recentClicks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No clicks recorded yet</p>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="grid gap-2 sm:hidden">
                {recentClicks.map((click) => (
                  <div key={click.id} className="rounded-lg border border-border p-3">
                    <p className="font-medium text-foreground">{click.product_name}</p>
                    <div className="mt-1 space-y-0.5 text-sm">
                      {click.content_slug && (
                        <p className="text-muted-foreground">Source: {click.content_slug}</p>
                      )}
                      {click.referrer && (
                        <p className="truncate text-muted-foreground">Ref: {click.referrer}</p>
                      )}
                      <p className="text-muted-foreground">
                        <LocalTime dateTime={click.created_at} />
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-start text-muted-foreground">
                      <th className="pb-2 font-medium">Product</th>
                      <th className="pb-2 font-medium">Source</th>
                      <th className="pb-2 font-medium">Referrer</th>
                      <th className="pb-2 text-end font-medium">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentClicks.map((click) => (
                      <tr key={click.id} className="border-b border-border/50">
                        <td className="py-2 text-foreground">{click.product_name}</td>
                        <td className="py-2 text-muted-foreground">
                          {click.content_slug || "\u2014"}
                        </td>
                        <td className="max-w-[200px] truncate py-2 text-muted-foreground">
                          {click.referrer || "\u2014"}
                        </td>
                        <td className="py-2 text-end text-muted-foreground">
                          <LocalTime dateTime={click.created_at} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {/* Footnote — 30d est-revenue figure kept visible for QA parity. */}
          <p className="mt-3 text-xs text-muted-foreground">
            Est. revenue (30d): ${estRevenue30d.toFixed(2)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
