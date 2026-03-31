import { getServiceClient } from "@/lib/supabase-server";

// ad_impressions is not in the generated Supabase types yet (migration pending),
// so we use the untyped `.from()` overload via a type-level cast.
const TABLE = "ad_impressions" as "sites"; // cast to known table to satisfy TS

/** Record an ad impression (upserts daily count) */
export async function recordAdImpression(
  siteId: string,
  adPlacementId: string,
  pagePath: string,
): Promise<void> {
  const sb = getServiceClient();
  const today = new Date().toISOString().split("T")[0];

  // Try to increment existing row for today
  // eslint-disable-next-line
  const { data: existing } = await (sb as any)
    .from("ad_impressions")
    .select("id, count")
    .eq("site_id", siteId)
    .eq("ad_placement_id", adPlacementId)
    .eq("page_path", pagePath)
    .eq("impression_date", today)
    .single();

  if (existing) {
    // eslint-disable-next-line
    await (sb as any)
      .from("ad_impressions")
      .update({ count: (existing.count as number) + 1 })
      .eq("id", existing.id);
  } else {
    // eslint-disable-next-line
    await (sb as any).from("ad_impressions").insert({
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
  // eslint-disable-next-line
  let query = (sb as any)
    .from("ad_impressions")
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
  for (const row of (data ?? []) as { ad_placement_id: string; count: number }[]) {
    map.set(row.ad_placement_id, (map.get(row.ad_placement_id) ?? 0) + row.count);
  }

  return Array.from(map.entries()).map(([ad_placement_id, total_impressions]) => ({
    ad_placement_id,
    total_impressions,
  }));
}
