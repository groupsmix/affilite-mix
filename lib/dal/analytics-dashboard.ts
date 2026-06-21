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

export interface AnalyticsSummary {
  totalClicks: number;
  estimatedRevenue: number;
  avgOrderValue: number;
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
  // T3-F3: the previous formula (estimatedRevenue / totalClicks) reduces
  // algebraically to estRevenuePerClick for all totalClicks > 0 — a tautology
  // that was never a real average order value. Return 0 until real AOV is
  // implemented from commissions data (sum(sale_amount) / count(distinct orders)).
  const avgOrderValue = 0;

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

export async function getDomainPerformance(sinceIso: string): Promise<DomainPerformanceRow[]> {
  const sites = await listSites();

  const rows = await Promise.all(
    sites.map(async (site) => {
      const clicks = await getClickCount(site.id, sinceIso);
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
