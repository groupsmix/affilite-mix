import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { MAX_LIMIT } from "./pagination-guard";
import { logger } from "@/lib/logger";

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
 * Results are capped at MAX_LIMIT to prevent unbounded result sets.
 */
export async function getNicheHealthStats(
  sevenDaysAgo: string,
  fourteenDaysAgo: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<NicheHealthRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .rpc("get_niche_health_stats", {
      p_seven_days_ago: sevenDaysAgo,
      p_fourteen_days_ago: fourteenDaysAgo,
    })
    .limit(MAX_LIMIT);

  if (error) {
    // RPC not deployed / failed (e.g. function missing, permission denied,
    // schema-cache miss, statement timeout) — degrade to "no niche data"
    // instead of throwing past the unguarded super_admin Dashboard cards.
    logger.error("[niche-health] get_niche_health_stats RPC unavailable, returning empty result", {
      error: error.message,
    });
    return [];
  }

  return (data ?? []) as NicheHealthRow[];
}
