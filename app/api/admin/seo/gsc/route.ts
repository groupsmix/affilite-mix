import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin-guard";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";
import { getSiteRowById } from "@/lib/dal/sites";
import {
  getSearchConsoleAccessToken,
  getSearchConsolePropertyType,
  querySearchAnalytics,
} from "@/lib/seo/search-console";
import { captureException } from "@/lib/sentry";

/**
 * GET /api/admin/seo/gsc?site_id=<uuid>&days=28
 *
 * Returns Google Search Console search-analytics data for the requested site,
 * plus a derived "opportunities" list of pages with high impressions but
 * below-average CTR (title/meta rewrite candidates).
 *
 * Requires super_admin because Search Console properties are cross-tenant
 * resources and the query may touch any site in the registry.
 */
export async function GET(request: NextRequest) {
  const { error, session } = await requireSuperAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await enforceAdminRateLimit("seo:gsc", session);
  if (rl) return rl;

  const siteId = request.nextUrl.searchParams.get("site_id");
  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days") ?? "28"), 1), 365);

  if (!siteId) {
    return NextResponse.json({ error: "Missing site_id" }, { status: 400 });
  }

  const accessToken = getSearchConsoleAccessToken();
  if (!accessToken) {
    return NextResponse.json(
      { error: "GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN not configured" },
      { status: 503 },
    );
  }

  const site = await getSiteRowById(siteId, () => getTenantClientForSite(siteId));
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const propertyType = getSearchConsolePropertyType();
  const siteUrl =
    propertyType === "domain" ? `sc-domain:${site.domain}` : `https://${site.domain}/`;

  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - days);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  try {
    const result = await querySearchAnalytics({
      siteUrl,
      accessToken,
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 5000,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || "Search Console query failed", status: result.status },
        { status: 502 },
      );
    }

    // Identify high-impression / low-CTR rewrite candidates.
    const totalCtr = result.rows.reduce((sum, r) => sum + r.ctr, 0) / (result.rows.length || 1);
    const opportunities = result.rows
      .filter((r) => r.impressions >= 100 && r.ctr < totalCtr * 0.5)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 25);

    return NextResponse.json({
      ok: true,
      siteId,
      domain: site.domain,
      startDate,
      endDate,
      totalRows: result.rows.length,
      averageCtr: Number(totalCtr.toFixed(4)),
      rows: result.rows,
      opportunities: opportunities.map((r) => ({
        page: r.keys[0],
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: Number(r.ctr.toFixed(4)),
        position: Number(r.position.toFixed(2)),
      })),
    });
  } catch (err) {
    captureException(err, { context: "[api/admin/seo/gsc] GET failed", extra: { siteId } });
    return NextResponse.json({ error: "Failed to query Search Console" }, { status: 500 });
  }
}
