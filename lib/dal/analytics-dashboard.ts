import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { getClickCount, getDailyClicks, getTopProducts } from "./affiliate-clicks";
import { countContent } from "./content";
import { countProducts } from "./products";
import { listSites } from "./sites";

// ── Types ───────────────────────────────────────────────────────────────

export interface RevenueTrendPoint {
  date: string;
  clicks: number;
  revenue: number;
}

/**
 * Distinguishes the three AOV outcomes so that the two zero-valued cases are
 * not conflated (R11.3 / R11.4):
 * - "computed"      — AOV is a real mean over at least one in-window order.
 * - "empty-period"  — the commissions query succeeded but the in-window period
 *                     contained no orders; AOV is 0 by definition, not by error.
 * - "query-failure" — the commissions query failed; AOV is 0 and no partial
 *                     results are retained.
 */
export type AovIndication = "computed" | "empty-period" | "query-failure";

export interface AnalyticsSummary {
  totalClicks: number;
  estimatedRevenue: number;
  avgOrderValue: number;
  /**
   * Indicates whether `avgOrderValue` reflects a real computation, an empty
   * in-window period, or a commissions-query failure. Lets consumers tell the
   * two zero-valued outcomes apart.
   */
  avgOrderValueStatus: AovIndication;
  growthRatePct: number;
  activeProducts: number;
  publishedContent: number;
}

export interface TopProductRow {
  product_name: string;
  click_count: number;
  estimatedRevenue: number;
}

export interface DomainPerformanceRow {
  siteId: string;
  slug: string;
  name: string;
  domain: string;
  clicks: number;
  revenue: number;
}

export interface ConversionFunnelStep {
  stage: string;
  count: number;
}

// ── Revenue over time ───────────────────────────────────────────────────

export async function getRevenueTrend(
  siteId: string,
  days: number,
  estRevenuePerClick: number,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<RevenueTrendPoint[]> {
  const dailyClicks = await getDailyClicks(siteId, days, getClient);
  return dailyClicks.map((d) => ({
    date: d.date,
    clicks: d.count,
    revenue: parseFloat((d.count * estRevenuePerClick).toFixed(2)),
  }));
}

// ── Summary KPIs ────────────────────────────────────────────────────────

export async function getAnalyticsSummary(
  siteId: string,
  days: number,
  estRevenuePerClick: number,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AnalyticsSummary> {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  const prevSince = new Date(now.getTime() - 2 * days * 86_400_000).toISOString();

  const [totalClicks, prevClicks, activeProducts, publishedContent] = await Promise.all([
    getClickCount(siteId, since, undefined, getClient),
    getClickCount(siteId, prevSince, since, getClient),
    countProducts({ siteId, status: "active" }, getClient),
    countContent({ siteId, status: "published" }, getClient),
  ]);

  const estimatedRevenue = totalClicks * estRevenuePerClick;

  // B-F3: the previous formula was `estimatedRevenue / totalClicks` which reduces
  // algebraically to `estRevenuePerClick` for all totalClicks > 0 — a tautology,
  // not a real average order value. Compute real AOV from actual commission
  // sale_amount rows for this site and period instead.
  let avgOrderValue = 0;
  // Defaults to "empty-period"; promoted to "computed" when at least one
  // in-window order exists, or set to "query-failure" if the query throws or
  // returns an error. This keeps the two zero-valued outcomes distinguishable.
  let avgOrderValueStatus: AovIndication = "empty-period";
  try {
    const sb = await Promise.resolve(getClient());
    const { data: commRows, error: commError } = await sb
      .from("commissions")
      .select("sale_amount")
      .eq("site_id", siteId)
      .gte("event_date", since)
      .in("status", ["approved", "paid"]);
    if (commError) {
      // a query-level error is a failure, not an empty period
      throw commError;
    }
    const orders = (commRows ?? []).filter(
      (r: { sale_amount: number | null }) => Number(r.sale_amount) > 0,
    );
    if (orders.length > 0) {
      const totalSale = orders.reduce(
        (s: number, r: { sale_amount: number | null }) => s + Number(r.sale_amount),
        0,
      );
      avgOrderValue = parseFloat((totalSale / orders.length).toFixed(2));
      avgOrderValueStatus = "computed";
    } else {
      // query succeeded but no orders fell in the window
      avgOrderValueStatus = "empty-period";
    }
  } catch {
    // commission-query failure — fall back to 0 and flag it as a query failure
    // (distinct from an empty period), retaining no partial results
    avgOrderValue = 0;
    avgOrderValueStatus = "query-failure";
  }

  let growthRatePct = 0;
  if (prevClicks > 0) {
    growthRatePct = ((totalClicks - prevClicks) / prevClicks) * 100;
  } else if (totalClicks > 0) {
    growthRatePct = 100;
  }

  return {
    totalClicks,
    estimatedRevenue,
    avgOrderValue,
    avgOrderValueStatus,
    growthRatePct: parseFloat(growthRatePct.toFixed(1)),
    activeProducts,
    publishedContent,
  };
}

// ── Top products with revenue ───────────────────────────────────────────

export async function getTopProductsWithRevenue(
  siteId: string,
  since: string,
  estRevenuePerClick: number,
  limit = 20,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<TopProductRow[]> {
  const topProducts = await getTopProducts(siteId, since, limit, undefined, getClient);
  return topProducts.map((p) => ({
    product_name: p.product_name,
    click_count: p.click_count,
    estimatedRevenue: parseFloat((p.click_count * estRevenuePerClick).toFixed(2)),
  }));
}

// ── Domain / site breakdown (super-admin) ───────────────────────────────

/**
 * B-F2: this function iterates listSites() (the full tenant registry) and
 * counts clicks per site — it is inherently cross-tenant. The previous
 * implementation used the default RLS-bound tenant client, so every non-active
 * site returned 0 clicks and $0 revenue (the RLS policy filtering by
 * current_request_site_ids() denied access). The caller MUST pass a privileged
 * client so the rollup reflects real per-tenant data.
 */
export async function getDomainPerformance(
  sinceIso: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<DomainPerformanceRow[]> {
  const sites = await listSites(getClient);

  const rows = await Promise.all(
    sites.map(async (site) => {
      const clicks = await getClickCount(site.id, sinceIso, undefined, getClient);
      const ratePerClick = Number(site.est_revenue_per_click ?? 0);
      return {
        siteId: site.id,
        slug: site.slug,
        name: site.name,
        domain: site.domain,
        clicks,
        revenue: parseFloat((clicks * ratePerClick).toFixed(2)),
      } satisfies DomainPerformanceRow;
    }),
  );

  return rows.sort((a, b) => b.clicks - a.clicks);
}

// ── Conversion funnel ───────────────────────────────────────────────────

export async function getConversionFunnel(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ConversionFunnelStep[]> {
  const [totalProducts, activeProducts, publishedContent, totalClicks] = await Promise.all([
    countProducts({ siteId }, getClient),
    countProducts({ siteId, status: "active" }, getClient),
    countContent({ siteId, status: "published" }, getClient),
    getClickCount(siteId, undefined, undefined, getClient),
  ]);

  return [
    { stage: "Products Created", count: totalProducts },
    { stage: "Products Active", count: activeProducts },
    { stage: "Content Published", count: publishedContent },
    { stage: "Clicks (Conversions)", count: totalClicks },
  ];
}
