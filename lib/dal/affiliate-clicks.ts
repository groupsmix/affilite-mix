import { getServiceClient } from "@/lib/supabase-server";
import type { AffiliateClickRow } from "@/types/database";

const TABLE = "affiliate_clicks";

export interface RecordClickInput {
  site_id: string;
  product_id?: string;
  product_slug: string;
  source_page: string;
  source_type?: string;
  destination_url: string;
  ip_hash?: string;
  user_agent?: string;
  referrer?: string;
  country?: string;
}

/** Record an affiliate click (fire-and-forget) */
export async function recordClick(
  input: RecordClickInput,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).insert({
    site_id: input.site_id,
    product_id: input.product_id ?? null,
    product_slug: input.product_slug,
    source_page: input.source_page,
    source_type: input.source_type ?? "unknown",
    destination_url: input.destination_url,
    ip_hash: input.ip_hash ?? null,
    user_agent: input.user_agent ?? null,
    referrer: input.referrer ?? null,
    country: input.country ?? null,
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
