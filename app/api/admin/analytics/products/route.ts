import { NextRequest, NextResponse } from "next/server";
import { getTopProductsWithRevenue } from "@/lib/dal/analytics-dashboard";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { getSiteById } from "@/config/sites";
import { resolveEstimatedRevenuePerClick } from "@/lib/analytics/epc";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/analytics/products — Top products by clicks/revenue.
 * Query params:
 *   ?days=30  — lookback window (default 30, max 365)
 *   ?limit=20 — max rows (default 20, max 100)
 */
export const GET = withAuthz(
  "analytics",
  "view",
  async (request: NextRequest, { session, siteId, siteSlug }) => {
    const rlResponse = await enforceAdminRateLimit("analytics:products", session);
    if (rlResponse) return rlResponse;

    try {
      const sp = request.nextUrl.searchParams;
      const days = Math.min(Math.max(Number(sp.get("days") ?? "30"), 1), 365);
      const limit = Math.min(Math.max(Number(sp.get("limit") ?? "20"), 1), 100);

      const since = new Date();
      since.setDate(since.getDate() - days);

      const dbSite = await resolveDbSiteBySlug(siteSlug);
      const siteConfig = getSiteById(siteSlug);
      const estRevenuePerClick = resolveEstimatedRevenuePerClick({
        siteConfig,
        dbSite,
      });

      const products = await getTopProductsWithRevenue(
        siteId,
        since.toISOString(),
        estRevenuePerClick,
        limit,
      );

      return NextResponse.json({ days, products });
    } catch (err) {
      captureException(err, { context: "[api/admin/analytics/products] GET failed:" });
      return NextResponse.json({ error: "Failed to load product analytics" }, { status: 500 });
    }
  },
);
