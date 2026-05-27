import { NextRequest, NextResponse } from "next/server";
import {
  getClickCount,
  getTopProducts,
  getTopReferrers,
  getDailyClicks,
} from "@/lib/dal/affiliate-clicks";
import { countContent } from "@/lib/dal/content";
import { countProducts } from "@/lib/dal/products";
import { captureException } from "@/lib/sentry";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/analytics — Dashboard analytics for the active site.
 * Query params:
 *   ?days=30  — lookback window for click data (default 30)
 */
export const GET = withAuthz(
  "analytics",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("analytics", session);
    if (rlResponse) return rlResponse;

    try {
      const days = Math.min(
        Math.max(Number(request.nextUrl.searchParams.get("days") ?? "30"), 1),
        365,
      );
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceIso = since.toISOString();

      const [
        totalClicks,
        topProducts,
        topReferrers,
        dailyClicks,
        publishedContent,
        draftContent,
        activeProducts,
      ] = await Promise.all([
        getClickCount(siteId, sinceIso),
        getTopProducts(siteId, sinceIso, 10),
        getTopReferrers(siteId, sinceIso, 10),
        getDailyClicks(siteId, days),
        countContent({ siteId, status: "published" }),
        countContent({ siteId, status: "draft" }),
        countProducts({ siteId, status: "active" }),
      ]);

      return NextResponse.json({
        period: { days, since: sinceIso },
        clicks: {
          total: totalClicks,
          daily: dailyClicks,
          topProducts,
          topReferrers,
        },
        content: {
          published: publishedContent,
          draft: draftContent,
        },
        products: {
          active: activeProducts,
        },
      });
    } catch (err) {
      captureException(err, { context: "[api/admin/analytics] GET failed:" });
      return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
    }
  },
);
