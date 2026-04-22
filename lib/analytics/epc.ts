import type { SiteDefinition } from "@/config/site-definition";
import type { SiteRow } from "@/types/database";

/**
 * Default estimated revenue per affiliate click (USD).
 *
 * Resolution order is:
 *  1. Static site config: `SiteDefinition.estRevenuePerClick`
 *  2. Database site row: `SiteRow.est_revenue_per_click`
 *  3. Hard fallback: `0.35`
 */
export const DEFAULT_EST_REVENUE_PER_CLICK = 0.35;

/**
 * Pure EPC resolver shared by admin analytics surfaces.
 *
 * This helper intentionally accepts optional partial inputs so callers can
 * provide whichever source(s) they already have in memory without forcing
 * extra I/O inside the resolver itself.
 */
export function resolveEstimatedRevenuePerClick({
  siteConfig,
  dbSite,
}: {
  siteConfig?: Pick<SiteDefinition, "estRevenuePerClick"> | null;
  dbSite?: Pick<SiteRow, "est_revenue_per_click"> | null;
} = {}): number {
  const staticConfigValue = siteConfig?.estRevenuePerClick;
  if (typeof staticConfigValue === "number" && Number.isFinite(staticConfigValue)) {
    return staticConfigValue;
  }

  const dbValue = dbSite?.est_revenue_per_click;
  if (typeof dbValue === "number" && Number.isFinite(dbValue)) {
    return dbValue;
  }

  return DEFAULT_EST_REVENUE_PER_CLICK;
}
