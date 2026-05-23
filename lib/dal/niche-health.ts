import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

export interface NicheHealthRow {
  site_id: string;
  total_products: number;
  total_content: number;
  clicks_7d: number;
  clicks_prev_7d: number;
  last_published_at: string | null;
  subscriber_count: number;
}

/**
 * Fetch aggregated health stats for all active sites in a single RPC call.
 * Replaces the N+1 pattern of querying each table per site individually.
 */
export async function getNicheHealthStats(
  sevenDaysAgo: string,
  fourteenDaysAgo: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<NicheHealthRow[]> {
  const sb = await getClient();

  const { data, error } = await sb.rpc("get_niche_health_stats", {
    p_seven_days_ago: sevenDaysAgo,
    p_fourteen_days_ago: fourteenDaysAgo,
  });

  if (error) throw error;

  return (data ?? []) as NicheHealthRow[];
}
