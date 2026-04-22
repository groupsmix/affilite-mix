import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, hasNumberProp } from "./type-guards";

const TABLE = "ad_impressions";

/** Record an ad impression (atomic upsert for concurrency safety) */
export async function recordAdImpression(
  siteId: string,
  adPlacementId: string,
  pagePath: string,
  contentId?: string,
  cpmRevenueCents = 0,
): Promise<void> {
  const sb = getServiceClient();

  // Use database-level atomic function for maximum safety under concurrency
  // This is more reliable than application-level upsert because it's a single
  // database operation that's guaranteed atomic by PostgreSQL.
  const { error } = await sb.rpc("record_ad_impression", {
    p_site_id: siteId,
    p_ad_placement_id: adPlacementId,
    p_content_id: contentId ?? null,
    p_page_path: pagePath,
    p_cpm_revenue_cents: cpmRevenueCents,
  });

  // Fire-and-forget: log but don't throw
  if (error) {
    console.error("Failed to record ad impression:", error.message);
  }
}

/** Get impression stats for a site over a date range */
export async function getAdImpressionStats(
  siteId: string,
  startDate: string,
  endDate?: string,
): Promise<{ ad_placement_id: string; total_impressions: number }[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("ad_placement_id, impression_count")
    .eq("site_id", siteId)
    .gte("impression_date", startDate);

  if (endDate) {
    query = query.lte("impression_date", endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Aggregate by placement
  const map = new Map<string, number>();
  for (const row of assertRows<{ ad_placement_id: string; impression_count: number }>(
    data ?? [],
  )) {
    map.set(row.ad_placement_id, (map.get(row.ad_placement_id) ?? 0) + row.impression_count);
  }

  return Array.from(map.entries()).map(([ad_placement_id, total_impressions]) => ({
    ad_placement_id,
    total_impressions,
  }));
}
