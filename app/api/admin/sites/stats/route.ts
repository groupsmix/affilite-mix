import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { listSites } from "@/lib/dal/sites";
import { countContent } from "@/lib/dal/content";
import { countProducts } from "@/lib/dal/products";
import { getClickCount } from "@/lib/dal/affiliate-clicks";

/** 100 admin API requests per minute per user session */
const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

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
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rlKey = `admin:${session.email ?? session.userId ?? "unknown"}`;
  const rl = await checkRateLimit(rlKey, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get("days") ?? "7"), 1), 365);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  try {
    const rows = await listSites();

    const entries = await Promise.all(
      rows.map(async (row) => {
        const [activeProducts, publishedContent, clicks] = await Promise.all([
          countProducts({ siteId: row.id, status: "active" }).catch(() => 0),
          countContent({ siteId: row.id, status: "published" }).catch(() => 0),
          getClickCount(row.id, sinceIso).catch(() => 0),
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
