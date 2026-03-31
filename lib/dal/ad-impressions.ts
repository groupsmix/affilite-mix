import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, hasNumberProp } from "./type-guards";

const TABLE = "ad_impressions";

/** Record an ad impression (upserts daily count) */
export async function recordAdImpression(
  siteId: string,
  adPlacementId: string,
  pagePath: string,
): Promise<void> {
  const sb = getServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // Try to find existing row for today
  const { data: existing } = await sb
    .from(TABLE)
    .select("id, count")
    .eq("site_id", siteId)
    .eq("ad_placement_id", adPlacementId)
    .eq("page_path", pagePath)
    .eq("impression_date", today)
    .single();

  if (existing && hasNumberProp(existing, "count")) {
    await sb
      .from(TABLE)
      .update({ count: existing.count + 1 })
      .eq("id", (existing as unknown as { id: string }).id);
  } else {
    await sb.from(TABLE).insert({
      site_id: siteId,
      ad_placement_id: adPlacementId,
      page_path: pagePath,
      impression_date: today,
      count: 1,
    });
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
    .select("ad_placement_id, count")
    .eq("site_id", siteId)
    .gte("impression_date", startDate);

  if (endDate) {
    query = query.lte("impression_date", endDate);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Aggregate by placement
  const map = new Map<string, number>();
  for (const row of assertRows<{ ad_placement_id: string; count: number }>(data ?? [])) {
    map.set(row.ad_placement_id, (map.get(row.ad_placement_id) ?? 0) + row.count);
  }

  return Array.from(map.entries()).map(([ad_placement_id, total_impressions]) => ({
    ad_placement_id,
    total_impressions,
  }));
}
