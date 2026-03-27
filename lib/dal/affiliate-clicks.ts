import { getServiceClient } from "@/lib/supabase-server";
import type { AffiliateClickRow } from "@/types/database";

const TABLE = "affiliate_clicks";

export interface RecordClickInput {
  site_id: string;
  product_name: string;
  affiliate_url: string;
  content_slug?: string;
  referrer?: string;
}

/** Record an affiliate click (fire-and-forget) */
export async function recordClick(
  input: RecordClickInput,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).insert({
    site_id: input.site_id,
    product_name: input.product_name,
    affiliate_url: input.affiliate_url,
    content_slug: input.content_slug ?? "",
    referrer: input.referrer ?? "",
  });

  // Fire-and-forget: log but don't throw
  if (error) {
    console.error("Failed to record affiliate click:", error.message);
  }
}

/** Get click count for a site (admin analytics) */
export async function getClickCount(
  siteId: string,
  since?: string,
): Promise<number> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId);

  if (since) query = query.gte("created_at", since);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Get recent clicks for a site (admin) */
export async function getRecentClicks(
  siteId: string,
  limit = 50,
): Promise<AffiliateClickRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as AffiliateClickRow[];
}

/** Get top clicked products for a site (admin analytics) */
export async function getTopProducts(
  siteId: string,
  since?: string,
  limit = 10,
): Promise<{ product_name: string; click_count: number }[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("product_name")
    .eq("site_id", siteId);

  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) throw error;

  // Aggregate in JS since Supabase JS client doesn't support GROUP BY
  const counts = new Map<string, number>();
  for (const row of data as { product_name: string }[]) {
    counts.set(row.product_name, (counts.get(row.product_name) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([product_name, click_count]) => ({ product_name, click_count }))
    .sort((a, b) => b.click_count - a.click_count)
    .slice(0, limit);
}

/** Get top referring pages for a site (admin analytics) */
export async function getTopReferrers(
  siteId: string,
  since?: string,
  limit = 10,
): Promise<{ referrer: string; click_count: number }[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("referrer")
    .eq("site_id", siteId);

  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of data as { referrer: string }[]) {
    const ref = row.referrer || "(direct)";
    counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([referrer, click_count]) => ({ referrer, click_count }))
    .sort((a, b) => b.click_count - a.click_count)
    .slice(0, limit);
}

/** Get daily click counts for a site (admin analytics chart data) */
export async function getDailyClicks(
  siteId: string,
  days = 30,
): Promise<{ date: string; count: number }[]> {
  const sb = getServiceClient();
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await sb
    .from(TABLE)
    .select("created_at")
    .eq("site_id", siteId)
    .gte("created_at", since.toISOString());

  if (error) throw error;

  // Aggregate by date in JS
  const counts = new Map<string, number>();
  for (const row of data as { created_at: string }[]) {
    const date = row.created_at.split("T")[0];
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  // Fill missing dates with 0
  const result: { date: string; count: number }[] = [];
  const cursor = new Date(since);
  const today = new Date();
  while (cursor <= today) {
    const dateStr = cursor.toISOString().split("T")[0];
    result.push({ date: dateStr, count: counts.get(dateStr) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return result;
}
