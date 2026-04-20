import { getServiceClient } from "@/lib/supabase-server";

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
 */
export async function getDashboardStats(
  siteId: string,
  todayStart: string,
  sevenDaysAgo: string,
): Promise<DashboardStats> {
  const sb = getServiceClient();

  const { data, error } = await sb.rpc("get_dashboard_stats", {
    p_site_id: siteId,
    p_today_start: todayStart,
    p_seven_days_ago: sevenDaysAgo,
  });

  if (error) {
    // RPC not deployed yet — fall back to individual count queries
    console.warn(
      "[dashboard-stats] RPC unavailable, falling back to individual queries:",
      error.message,
    );
    return fallbackDashboardStats(siteId, todayStart, sevenDaysAgo);
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
}

/** Fallback: individual queries when RPC is not available */
async function fallbackDashboardStats(
  siteId: string,
  todayStart: string,
  sevenDaysAgo: string,
): Promise<DashboardStats> {
  const sb = getServiceClient();

  const [
    { count: totalProducts },
    { count: activeProducts },
    { count: draftProducts },
    { count: totalContent },
    { count: publishedContent },
    { count: draftContent },
    { count: clicksToday },
    { count: clicks7d },
  ] = await Promise.all([
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

  // Products with no affiliate URL
  // NOTE: head:true returns no row data — destructure count, not data.length
  const { count: productsNoUrl } = await sb
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("status", "active")
    .or("affiliate_url.is.null,affiliate_url.eq.");

  // Content with no linked products
  // Fetch only published content IDs for this site, then check which have linked products
  const { data: publishedIds } = await sb
    .from("content")
    .select("id")
    .eq("site_id", siteId)
    .eq("status", "published");
  const pubIds = (publishedIds ?? []).map((r: { id: string }) => r.id);
  let contentNoProducts = pubIds.length;
  if (pubIds.length > 0) {
    const { data: linkedRows } = await sb
      .from("content_products")
      .select("content_id")
      .in("content_id", pubIds);
    const linkedIds = new Set((linkedRows ?? []).map((r: { content_id: string }) => r.content_id));
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
    total_products: totalProducts ?? 0,
    active_products: activeProducts ?? 0,
    draft_products: draftProducts ?? 0,
    total_content: totalContent ?? 0,
    published_content: publishedContent ?? 0,
    draft_content: draftContent ?? 0,
    clicks_today: clicksToday ?? 0,
    clicks_7d: clicks7d ?? 0,
    products_no_url: productsNoUrl ?? 0,
    content_no_products: contentNoProducts,
    scheduled_content: scheduledContent ?? 0,
  };
}
