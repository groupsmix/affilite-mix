import { NextRequest, NextResponse } from "next/server";
import { getAnalyticsSummary } from "@/lib/dal/analytics-dashboard";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { getSiteById } from "@/config/sites";
import { resolveEstimatedRevenuePerClick } from "@/lib/analytics/epc";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/analytics/summary — Overall KPIs.
 * Query params:
 *   ?days=30  — lookback window (default 30, max 365)
 */
export const GET = withAuthz(
  "analytics",
  "view",
  async (request: NextRequest, { session, siteId, siteSlug }) => {
    const rlResponse = await enforceAdminRateLimit("analytics:summary", session);
    if (rlResponse) return rlResponse;

    try {
      const days = Math.min(
        Math.max(Number(request.nextUrl.searchParams.get("days") ?? "30"), 1),
        365,
      );

      const dbSite = await resolveDbSiteBySlug(siteSlug);
      const siteConfig = getSiteById(siteSlug);
      const estRevenuePerClick = resolveEstimatedRevenuePerClick({
        siteConfig,
        dbSite,
      });

      const summary = await getAnalyticsSummary(siteId, days, estRevenuePerClick);

      return NextResponse.json({ days, ...summary });
    } catch (err) {
      captureException(err, { context: "[api/admin/analytics/summary] GET failed:" });
      return NextResponse.json({ error: "Failed to load analytics summary" }, { status: 500 });
    }
  },
);
