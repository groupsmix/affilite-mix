import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  getClickCount,
  getTopProducts,
  getTopReferrers,
  getDailyClicks,
} from "@/lib/dal/affiliate-clicks";
import { countContent } from "@/lib/dal/content";
import { countProducts } from "@/lib/dal/products";
import { captureException } from "@/lib/sentry";

/**
 * GET /api/admin/analytics — Dashboard analytics for the active site.
 * Query params:
 *   ?days=30  — lookback window for click data (default 30)
 */
export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

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
      getClickCount(dbSiteId, sinceIso),
      getTopProducts(dbSiteId, sinceIso, 10),
      getTopReferrers(dbSiteId, sinceIso, 10),
      getDailyClicks(dbSiteId, days),
      countContent({ siteId: dbSiteId, status: "published" }),
      countContent({ siteId: dbSiteId, status: "draft" }),
      countProducts({ siteId: dbSiteId, status: "active" }),
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
}
