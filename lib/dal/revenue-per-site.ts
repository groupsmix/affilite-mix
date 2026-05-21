// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import { unstable_cache } from "next/cache";

import { getClickCount } from "@/lib/dal/affiliate-clicks";
import { listSites } from "@/lib/dal/sites";

/**
 * Per-site click + estimated-revenue aggregate used by the super-admin
 * "Estimated revenue (7d)" dashboard card.
 *
 * Computation: `revenue = clicks × est_revenue_per_click`. Both inputs come
 * from existing tables (`affiliate_clicks` for clicks, `sites` for the
 * per-site rate) — no new migrations, RPCs, or columns are introduced.
 *
 * The underlying query is one cheap COUNT per active site. Even at ~50 sites
 * that is still fast, but since the dashboard auto-refreshes every 60 s we
 * wrap the computation in `unstable_cache` to avoid thrashing the database.
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

/**
 * Cache tag for `revalidateTag()` callers that mutate click/site data and
 * want the dashboard card to refresh before its 60 s window elapses.
 */
export const REVENUE_PER_SITE_TAG = "dashboard:revenue-7d";

/** How long the cross-site aggregate is cached (seconds). */
export const REVENUE_PER_SITE_REVALIDATE_SECONDS = 60;

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
    const sites = await listSites();

    const rows = await Promise.all(
      sites.map(async (site) => {
        const clicks = await getClickCount(site.id, sinceIso);
        const ratePerClick = Number(site.est_revenue_per_click ?? 0);
        return {
          siteId: site.id,
          slug: site.slug,
          name: site.name,
          clicks,
          ratePerClick,
          revenue: clicks * ratePerClick,
        } satisfies SiteRevenueRow;
      }),
    );

    // Sort by revenue desc so the top-earning niche is always first.
    return rows.sort((a, b) => b.revenue - a.revenue);
  },
  ["dashboard-revenue-per-site"],
  {
    revalidate: REVENUE_PER_SITE_REVALIDATE_SECONDS,
    tags: [REVENUE_PER_SITE_TAG],
  },
);
