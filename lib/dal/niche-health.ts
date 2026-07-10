import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { MAX_LIMIT } from "./pagination-guard";
import { logger } from "@/lib/logger";
// The RPC aggregates global/cross-tenant data (products, content, clicks,
// newsletter subscribers) across every active site. RLS policies on the
// underlying tables only permit the current active site, so a tenant-scoped
// client returns zero or partial data; the privileged client is required.
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import

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
const defaultNicheHealthClientGetter: DalClientGetter = () =>
  getPrivilegedSupabaseClient("niche-health");

export async function getNicheHealthStats(
  sevenDaysAgo: string,
  fourteenDaysAgo: string,
  getClient: DalClientGetter = defaultNicheHealthClientGetter,
): Promise<NicheHealthRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .rpc("get_niche_health_stats", {
      p_seven_days_ago: sevenDaysAgo,
      p_fourteen_days_ago: fourteenDaysAgo,
    })
    // SAFE: cross-tenant aggregate RPC has no p_site_id; the privileged client is used for this admin-only query.
    .unsafeNoSiteFilter()
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
