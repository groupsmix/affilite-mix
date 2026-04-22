import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/admin/page-header";
import { KpiCard } from "../components/dashboard/kpi-card";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { resolveEstimatedRevenuePerClick } from "@/lib/analytics/epc";
import {
  getAnalyticsRangeLabel,
  parseAnalyticsRange,
  type AnalyticsRangeSearchParams,
} from "@/lib/analytics/range";
import {
  getClickCount,
  getDailyClicks,
  getRecentClicks,
  getTopContentSlugs,
  getTopProducts,
  getTopReferrers,
} from "@/lib/dal/affiliate-clicks";
import { getAdImpressionStats } from "@/lib/dal/ad-impressions";

import { listProductsByNames } from "@/lib/dal/products";
import { resolveDbSiteBySlug, resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getSiteById } from "@/config/sites";

import { requireAdminSession } from "../components/admin-guard";
import { ClickChart } from "./click-chart";
import { ExpandableTable } from "./expandable-table";
import { MultiNicheOverview } from "./multi-niche-overview";
import { RangeSelector } from "./range-selector";
import { RecentClicksTable, type RecentClickRow } from "./recent-clicks-table";

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function getReferrerMeta(referrer: string): {
  href: string | null;
  host: string | null;
  faviconUrl: string | null;
} {
  if (!referrer || referrer === "(direct)") {
    return { href: null, host: null, faviconUrl: null };
  }

  try {
    const url = new URL(referrer);
    return {
      href: url.toString(),
      host: url.hostname,
      faviconUrl: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url.hostname)}&sz=64`,
    };
  } catch {
    return { href: null, host: null, faviconUrl: null };
  }
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<AnalyticsRangeSearchParams>;
}) {
  const session = await requireAdminSession();
  const activeSiteSlug = session.activeSiteSlug ?? "";

  if (!activeSiteSlug) {
    redirect("/admin/sites");
  }

  const isSuperAdmin = session.role === "super_admin";
  const dbSite = await resolveDbSiteBySlug(activeSiteSlug);
  const siteId = dbSite?.id ?? (await resolveDbSiteId(activeSiteSlug));
  const siteConfig = getSiteById(activeSiteSlug);

  const sp = await searchParams;
  const range = parseAnalyticsRange(sp);
  const rangeLabel = range.isCustom ? range.label : getAnalyticsRangeLabel(range.key);
  const rangeHeadingSuffix = range.isCustom ? rangeLabel : getAnalyticsRangeLabel(range.key);

  const estRevenuePerClick = resolveEstimatedRevenuePerClick({
    siteConfig,
    dbSite,
  });

  const [
    clicksInRange,
    topProducts,
    topReferrers,
    topContent,
    dailyClicks,
    recentClicks,
    adImpressionStats,
  ] = await Promise.all([
    getClickCount(siteId, range.since, range.until),
    getTopProducts(siteId, range.since, 50, range.until),
    getTopReferrers(siteId, range.since, 50, range.until),
    getTopContentSlugs(siteId, range.since, 50, range.until),
    getDailyClicks(siteId, {
      since: range.since,
      until: range.until,
    }),
    getRecentClicks(siteId, 20, {
      since: range.since,
      until: range.until,
    }),
    getAdImpressionStats(siteId, range.since.slice(0, 10), range.until?.slice(0, 10)),
  ]);

  const uniqueReferrers = topReferrers.length;
  const estimatedRevenue = clicksInRange * estRevenuePerClick;
  const totalAdImpressions = adImpressionStats.reduce((sum, row) => sum + row.total_impressions, 0);
  const showAdImpressionsCard =
    (dbSite?.monetization_type ?? siteConfig?.monetizationType) === "ads" ||
    (dbSite?.monetization_type ?? siteConfig?.monetizationType) === "both";

  const productRows =
    topProducts.length > 0
      ? await listProductsByNames(
          siteId,
          topProducts.map((p) => p.product_name),
        )
      : [];
  const productByName = new Map<string, { id: string; image_url: string; image_alt: string }>();
  for (const row of productRows) {
    productByName.set(row.name, {
      id: row.id,
      image_url: row.image_url ?? "",
      image_alt: row.image_alt ?? row.name,
    });
  }

  const topContentWithTitles = topContent.map((row) => ({
    ...row,
    displayTitle: row.content_slug,
  }));

  const recentClickRows: RecentClickRow[] = recentClicks;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        title="Analytics"
        description={
          <>
            Affiliate click analytics for{" "}
            <span className="font-medium text-foreground">
              {session.activeSiteName ?? session.activeSiteSlug}
            </span>
          </>
        }
        actions={<RangeSelector />}
      />

      {isSuperAdmin && <MultiNicheOverview />}

      <div aria-live="polite" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div role="region" aria-label="Clicks KPI">
          <KpiCard
            title="Clicks"
            value={clicksInRange.toLocaleString()}
            description={rangeLabel}
            className="h-full"
          />
        </div>
        <div role="region" aria-label="Unique referrers KPI">
          <KpiCard
            title="Unique referrers"
            value={uniqueReferrers.toLocaleString()}
            description={`Top referrers captured for ${rangeLabel.toLowerCase()}.`}
            className="h-full"
          />
        </div>
        <div role="region" aria-label="Estimated revenue KPI">
          <KpiCard
            title="Estimated revenue"
            value={formatUSD(estimatedRevenue)}
            description={`Using ${formatUSD(estRevenuePerClick)}/click.`}
            className="h-full"
          />
        </div>
        {showAdImpressionsCard && (
          <div role="region" aria-label="Ad impressions KPI">
            <KpiCard
              title="Ad impressions"
              value={totalAdImpressions.toLocaleString()}
              description={rangeLabel}
              className="h-full"
            />
          </div>
        )}
      </div>

      <div className="mb-6">
        <Card role="region" aria-label="Daily clicks trend">
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Daily clicks trend</CardTitle>
              <CardDescription>{rangeHeadingSuffix}</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ClickChart data={dailyClicks} />
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card role="region" aria-label="Top products">
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Top products</CardTitle>
              <CardDescription>
                Most-clicked affiliate products for {rangeLabel.toLowerCase()}.
              </CardDescription>
            </div>
            <CardAction>
              <Link
                href="/admin/products"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                All products
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No click data yet.</p>
            ) : (
              <ExpandableTable rows={topProducts.length} initialLimit={10}>
                {(limit) => (
                  <ul className="divide-y divide-border">
                    {topProducts.slice(0, limit).map((product, index) => {
                      const match = productByName.get(product.product_name);
                      const href = match ? `/admin/products/${match.id}` : "/admin/products";
                      const image = match?.image_url;

                      return (
                        <li
                          key={`${product.product_name}-${index}`}
                          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <Badge variant="outline" className="shrink-0 tabular-nums">
                            #{index + 1}
                          </Badge>

                          <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                            {image ? (
                              <Image
                                src={image}
                                alt={match?.image_alt ?? product.product_name}
                                fill
                                sizes="40px"
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground"
                              >
                                {product.product_name.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <Link
                              href={href}
                              className="truncate text-sm font-medium text-foreground hover:underline"
                            >
                              {product.product_name}
                            </Link>
                          </div>

                          <div className="text-end">
                            <div className="text-sm font-semibold tabular-nums text-foreground">
                              {product.click_count.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">clicks</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ExpandableTable>
            )}
          </CardContent>
        </Card>

        <Card role="region" aria-label="Top referrers">
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Top referrers</CardTitle>
              <CardDescription>
                Where affiliate clicks came from during {rangeLabel.toLowerCase()}.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {topReferrers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referrer data yet.</p>
            ) : (
              <ExpandableTable rows={topReferrers.length} initialLimit={10}>
                {(limit) => (
                  <ul className="divide-y divide-border">
                    {topReferrers.slice(0, limit).map((referrer, index) => {
                      const meta = getReferrerMeta(referrer.referrer);

                      return (
                        <li
                          key={`${referrer.referrer}-${index}`}
                          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <Badge variant="outline" className="shrink-0 tabular-nums">
                            #{index + 1}
                          </Badge>

                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {meta.faviconUrl ? (
                              <Image
                                src={meta.faviconUrl}
                                alt=""
                                width={16}
                                height={16}
                                className="size-4 shrink-0 rounded-sm"
                                unoptimized
                              />
                            ) : (
                              <span
                                aria-hidden
                                className="inline-block size-4 shrink-0 rounded-sm bg-muted"
                              />
                            )}

                            <div className="min-w-0">
                              {meta.href ? (
                                <a
                                  href={meta.href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block truncate text-sm font-medium text-foreground hover:underline"
                                >
                                  {referrer.referrer}
                                </a>
                              ) : (
                                <span className="block truncate text-sm font-medium text-foreground">
                                  {referrer.referrer}
                                </span>
                              )}

                              {meta.host ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                  {meta.host}
                                </span>
                              ) : null}
                            </div>
                          </div>

                          <div className="text-end">
                            <div className="text-sm font-semibold tabular-nums text-foreground">
                              {referrer.click_count.toLocaleString()}
                            </div>
                            <div className="text-xs text-muted-foreground">clicks</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ExpandableTable>
            )}
          </CardContent>
        </Card>

        <Card role="region" aria-label="Top content">
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Top content</CardTitle>
              <CardDescription>
                Pages driving the most clicks for {rangeLabel.toLowerCase()}.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {topContentWithTitles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No content click data yet.</p>
            ) : (
              <ExpandableTable rows={topContentWithTitles.length} initialLimit={10}>
                {(limit) => (
                  <ul className="divide-y divide-border">
                    {topContentWithTitles.slice(0, limit).map((content, index) => (
                      <li
                        key={`${content.content_slug}-${index}`}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <Badge variant="outline" className="shrink-0 tabular-nums">
                          #{index + 1}
                        </Badge>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {content.displayTitle}
                          </p>
                          {content.displayTitle !== content.content_slug ? (
                            <p className="truncate text-xs text-muted-foreground">
                              {content.content_slug}
                            </p>
                          ) : null}
                        </div>

                        <div className="text-end">
                          <div className="text-sm font-semibold tabular-nums text-foreground">
                            {content.click_count.toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">clicks</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ExpandableTable>
            )}
          </CardContent>
        </Card>

        <Card role="region" aria-label="Recent clicks table" className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Recent clicks</CardTitle>
              <CardDescription>
                Latest recorded affiliate clicks within the selected window.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {recentClickRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clicks recorded yet.</p>
            ) : (
              <div role="region" aria-label="Recent clicks">
                <RecentClicksTable data={recentClickRows} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
