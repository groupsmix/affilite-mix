// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import { unstable_cache } from "next/cache";

import { getAnonClient } from "@/lib/supabase-server";
import { logger } from "@/lib/logger";

/**
 * Per-site click + estimated-revenue aggregate used by the super-admin
 * "Estimated revenue (7d)" dashboard card.
 *
 * Computation: `revenue = clicks × est_revenue_per_click`. Both inputs come
 * from existing tables (`affiliate_clicks` for clicks, `sites` for the
 * per-site rate).
 *
 * Previously this used an N+1 pattern (listSites() + N * getClickCount()).
 * Now a single RPC call (get_revenue_per_site) does the work in one query
 * using LEFT JOIN + LATERAL aggregate. Reduces 1+N queries to 1.
 */
export interface SiteRevenueRow {
  /** Stable DB UUID for the site (used as React key). */
  siteId: string;
  /** URL-safe slug — used as the link target / mobile label fallback. */
  slug: string;
  /** Human-readable site name shown in the card. */
  name: string;
  /** Raw click count for the window (last 7 days, inclusive). */
  clicks: number;
  /** Per-site configured revenue per click (USD). */
  ratePerClick: number;
  /** Derived: clicks × ratePerClick (USD). */
  revenue: number;
}

/** Raw row returned by the get_revenue_per_site RPC */
interface RevenuePerSiteRpcRow {
  site_id: string;
  slug: string;
  name: string;
  clicks: number;
  rate_per_click: number;
  revenue: number;
}

/**
 * Cache tag for `revalidateTag()` callers that mutate click/site data and
 * want the dashboard card to refresh before its 60 s window elapses.
 */
const REVENUE_PER_SITE_TAG = "dashboard:revenue-7d";

/** How long the cross-site aggregate is cached (seconds). */
const REVENUE_PER_SITE_REVALIDATE_SECONDS = 60;

/**
 * Compute the last-7-day click count and estimated revenue for every
 * registered site. Intended only for the super-admin dashboard card.
 *
 * Results are cached with `unstable_cache` for 60 s under the
 * `dashboard:revenue-7d` tag. The cache key incorporates the `sinceIso`
 * window so distinct callers sharing the same window reuse the entry.
 */
export async function getRevenuePerSite(sinceIso: string): Promise<SiteRevenueRow[]> {
  return cachedRevenueQuery(sinceIso);
}

const cachedRevenueQuery = unstable_cache(
  async (sinceIso: string): Promise<SiteRevenueRow[]> => {
    const sb = getAnonClient();
    const { data, error } = await sb.rpc("get_revenue_per_site", {
      p_since: sinceIso,
    });

    if (error) {
      logger.warn("[revenue] get_revenue_per_site RPC failed", {
        error: error.message,
      });
      return [];
    }

    return (data ?? []).map((row: RevenuePerSiteRpcRow) => ({
      siteId: row.site_id,
      slug: row.slug,
      name: row.name,
      clicks: row.clicks,
      ratePerClick: Number(row.rate_per_click),
      revenue: Number(row.revenue),
    }));
  },
  ["dashboard-revenue-per-site"],
  {
    revalidate: REVENUE_PER_SITE_REVALIDATE_SECONDS,
    tags: [REVENUE_PER_SITE_TAG],
  },
);
