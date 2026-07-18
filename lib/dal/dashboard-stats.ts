import { cache } from "react";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { logger } from "@/lib/logger";

export interface DashboardStats {
  total_products: number;
  active_products: number;
  draft_products: number;
  total_content: number;
  published_content: number;
  draft_content: number;
  clicks_today: number;
  clicks_7d: number;
  products_no_url: number;
  content_no_products: number;
  scheduled_content: number;
}

/**
 * Fetch all dashboard aggregate stats in a single RPC call.
 * Falls back to individual queries if the RPC is not yet deployed.
 *
 * Cached per request via React.cache so multiple dashboard components (e.g.
 * header power reserve + KPI grid) can share the same RPC result without
 * duplicating database work.
 */
export const getDashboardStats = cache(async function getDashboardStats(
  siteId: string,
  todayStart: string,
  sevenDaysAgo: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<DashboardStats> {
  const sb = await getClient();

  const { data, error } = await sb.rpc("get_dashboard_stats", {
    p_site_id: siteId,
    p_today_start: todayStart,
    p_seven_days_ago: sevenDaysAgo,
  });

  if (error) {
    // RPC not deployed yet — fall back to individual count queries
    logger.warn("[dashboard-stats] RPC unavailable, falling back to individual queries", {
      error: error.message,
    });
    try {
      return await fallbackDashboardStats(siteId, todayStart, sevenDaysAgo, getClient);
    } catch (fallbackError) {
      logger.warn("[dashboard-stats] fallback queries unavailable", {
        siteId,
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError),
      });
      return emptyDashboardStats();
    }
  }

  const stats = data as Record<string, number>;
  return {
    total_products: Number(stats.total_products ?? 0),
    active_products: Number(stats.active_products ?? 0),
    draft_products: Number(stats.draft_products ?? 0),
    total_content: Number(stats.total_content ?? 0),
    published_content: Number(stats.published_content ?? 0),
    draft_content: Number(stats.draft_content ?? 0),
    clicks_today: Number(stats.clicks_today ?? 0),
    clicks_7d: Number(stats.clicks_7d ?? 0),
    products_no_url: Number(stats.products_no_url ?? 0),
    content_no_products: Number(stats.content_no_products ?? 0),
    scheduled_content: Number(stats.scheduled_content ?? 0),
  };
});

/** Fallback: individual queries when RPC is not available */
function emptyDashboardStats(): DashboardStats {
  return {
    total_products: 0,
    active_products: 0,
    draft_products: 0,
    total_content: 0,
    published_content: 0,
    draft_content: 0,
    clicks_today: 0,
    clicks_7d: 0,
    products_no_url: 0,
    content_no_products: 0,
    scheduled_content: 0,
  };
}

async function fallbackDashboardStats(
  siteId: string,
  todayStart: string,
  sevenDaysAgo: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<DashboardStats> {
  const sb = await getClient();

  // BUG-9: use Promise.allSettled so a single transient count query failure
  // (e.g. affiliate_clicks temporarily unavailable) does not reject the entire
  // fallback and wipe all dashboard metrics. Each metric gracefully falls back
  // to 0 on failure.
  const countResults = await Promise.allSettled([
    sb.from("products").select("id", { count: "exact", head: true }).eq("site_id", siteId),
    sb
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("status", "active"),
    sb
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("status", "draft"),
    sb.from("content").select("id", { count: "exact", head: true }).eq("site_id", siteId),
    sb
      .from("content")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("status", "published"),
    sb
      .from("content")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("status", "draft"),
    sb
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .gte("created_at", todayStart),
    sb
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .gte("created_at", sevenDaysAgo),
  ]);

  function countOf(result: (typeof countResults)[number]): number {
    return result.status === "fulfilled" ? (result.value.count ?? 0) : 0;
  }

  const totalProducts = countOf(countResults[0]!);
  const activeProducts = countOf(countResults[1]!);
  const draftProducts = countOf(countResults[2]!);
  const totalContent = countOf(countResults[3]!);
  const publishedContent = countOf(countResults[4]!);
  const draftContent = countOf(countResults[5]!);
  const clicksToday = countOf(countResults[6]!);
  const clicks7d = countOf(countResults[7]!);

  // Products with no affiliate URL
  // NOTE: head:true returns no row data — destructure count, not data.length
  const { count: productsNoUrl } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("status", "active")
    .or("affiliate_url.is.null,affiliate_url.eq.");

  // S9-C1: Content with no linked products — capped to prevent full table scans.
  // Previous implementation fetched ALL published IDs with no limit, then did a
  // client-side filter. At 10K+ articles the `.in()` query would exceed PostgREST
  // URL limits (~8KB). Cap at 2000 and log a warning when the cap is hit.
  const CONTENT_CAP = 2000;
  const { data: publishedIds } = await sb
    .from("content")
    .select("id")
    .eq("site_id", siteId)
    .eq("status", "published")
    .limit(CONTENT_CAP);
  const pubIds: string[] = (publishedIds ?? []).map((r: { id: string }) => r.id);
  if (pubIds.length >= CONTENT_CAP) {
    logger.warn("[dashboard-stats] fallback content query hit CONTENT_CAP — count is approximate", {
      siteId,
      cap: CONTENT_CAP,
    });
  }
  let contentNoProducts = pubIds.length;
  if (pubIds.length > 0) {
    // Batch the .in() query to avoid exceeding PostgREST URL limits.
    const BATCH_SIZE = 500;
    const linkedIds = new Set<string>();
    for (let i = 0; i < pubIds.length; i += BATCH_SIZE) {
      const batch = pubIds.slice(i, i + BATCH_SIZE);
      const { data: linkedRows } = await sb
        .from("content_products")
        .select("content_id")
        .in("content_id", batch);
      for (const r of linkedRows ?? []) {
        linkedIds.add((r as { content_id: string }).content_id);
      }
    }
    contentNoProducts = pubIds.filter((id) => !linkedIds.has(id)).length;
  }

  // Scheduled content
  const { count: scheduledContent } = await sb
    .from("content")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("status", "scheduled")
    .gt("publish_at", new Date().toISOString());

  return {
    total_products: totalProducts,
    active_products: activeProducts,
    draft_products: draftProducts,
    total_content: totalContent,
    published_content: publishedContent,
    draft_content: draftContent,
    clicks_today: clicksToday,
    clicks_7d: clicks7d,
    products_no_url: productsNoUrl ?? 0,
    content_no_products: contentNoProducts,
    scheduled_content: scheduledContent ?? 0,
  };
}
