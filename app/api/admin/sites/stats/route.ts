import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { listSites } from "@/lib/dal/sites";
import { listAdminSiteMemberships } from "@/lib/dal/admin-site-memberships";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { countContent } from "@/lib/dal/content";
import { countProducts } from "@/lib/dal/products";
import { getClickCount } from "@/lib/dal/affiliate-clicks";

export interface SiteStats {
  activeProducts: number;
  publishedContent: number;
  clicks: number;
}

export interface SiteStatsResponse {
  period: { days: number; since: string };
  stats: Record<string, SiteStats>;
}

/**
 * GET /api/admin/sites/stats — batch per-site stats for the Site Manager grid.
 *
 * Returns a map of `slug -> { activeProducts, publishedContent, clicks }`
 * covering every DB-backed site. Sites that exist only in static config
 * (i.e. not in the `sites` table) are omitted from the response.
 *
 * NOTE (N+1): This iterates over DB sites and issues 3 count queries per
 * site, resulting in O(N*3) queries server-side. Acceptable for the small
 * number of tenants we expect today; migrate to a single aggregated SQL
 * query (or materialized view) if the site count grows.
 *
 * Query params:
 *   ?days=7  — lookback window for click data (default 7, min 1, max 365)
 */
export async function GET(request: NextRequest) {
  // Use requireAdminSession() (no site context) — this endpoint must work
  // before a site is selected (requireAdmin() demands a site cookie).
  const { error, session } = await requireAdminSession();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rlError = await enforceAdminRateLimit("sites-stats", session);
  if (rlError) return rlError;

  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days") ?? "7"), 1), 365);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  try {
    // Use the privileged client to avoid HS256/asymmetric-key JWT failures —
    // the same issue caught in app/api/admin/sites/route.ts (GET handler).
    const rows = await listSites(() => getPrivilegedSupabaseClient("admin-sites-stats"));

    // T1-F7 / audit-F7: non-super_admin users may only see stats for sites they
    // belong to. Mirrors the membership filter in app/api/admin/sites/route.ts
    // (GET). Without this, any admin session received per-tenant operational
    // stats for EVERY site (tenant enumeration + cross-tenant metric disclosure).
    // NOTE: main and PR #911 fixed this independently; this is the reconciled
    // single implementation (the duplicate F7 block from #911 was dropped).
    let scopedRows = rows;
    if (session.role !== "super_admin" && session.userId) {
      const memberships = await listAdminSiteMemberships(session.userId, () =>
        getPrivilegedSupabaseClient("admin-sites-stats"),
      );
      const allowedSiteIds = new Set(memberships.map((m) => m.site_id));
      scopedRows = rows.filter((row) => allowedSiteIds.has(row.id));
    }

    const getPrivileged = () => getPrivilegedSupabaseClient("admin-sites-stats");

    const entries = await Promise.all(
      scopedRows.map(async (row) => {
        const [activeProducts, publishedContent, clicks] = await Promise.all([
          countProducts({ siteId: row.id, status: "active" }, getPrivileged).catch(() => 0),
          countContent({ siteId: row.id, status: "published" }, getPrivileged).catch(() => 0),
          getClickCount(row.id, sinceIso, undefined, getPrivileged).catch(() => 0),
        ]);
        return [row.slug, { activeProducts, publishedContent, clicks }] as const;
      }),
    );

    const stats: Record<string, SiteStats> = {};
    for (const [slug, s] of entries) stats[slug] = s;

    const response: SiteStatsResponse = {
      period: { days, since: sinceIso },
      stats,
    };
    return NextResponse.json(response);
  } catch (err) {
    captureException(err, { context: "[api/admin/sites/stats] GET failed:" });
    return NextResponse.json({ error: "Failed to load site stats" }, { status: 500 });
  }
}
