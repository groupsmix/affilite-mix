import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { MAX_LIMIT } from "./pagination-guard";
import { logger } from "@/lib/logger";
// The RPC aggregates global/cross-tenant data (products, content, clicks,
// newsletter subscribers) across every active site. RLS policies on the
// underlying tables only permit the current active site, so a tenant-scoped
// client returns zero or partial data; the privileged client is required.
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { getClickCount } from "./affiliate-clicks";
import { countContent } from "./content";
import { countProducts } from "./products";
import { listAdminSites } from "./sites";
import { rowOrNull } from "./type-guards";
import type { ContentRow, SiteRow } from "@/types/database";

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
    // schema-cache miss, statement timeout) — fall back to per-site counts so
    // the Niche Health panel is never blank after a deployment that missed the
    // migration.
    logger.warn("[niche-health] get_niche_health_stats RPC unavailable, using fallback counts", {
      error: error.message,
    });
    return fallbackNicheHealthStats(sevenDaysAgo, fourteenDaysAgo, getClient);
  }

  return (data ?? []) as NicheHealthRow[];
}

async function getLastPublishedAt(
  siteId: string,
  getClient: DalClientGetter,
): Promise<string | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("content")
    .select("updated_at")
    .eq("site_id", siteId)
    .eq("status", "published")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  const row = rowOrNull<Pick<ContentRow, "updated_at">>(data);
  return row?.updated_at ?? null;
}

async function fallbackNicheHealthStats(
  sevenDaysAgo: string,
  fourteenDaysAgo: string,
  getClient: DalClientGetter,
): Promise<NicheHealthRow[]> {
  let sites: SiteRow[] = [];
  try {
    sites = await listAdminSites();
  } catch (error: unknown) {
    logger.error("[niche-health] fallback cannot list sites", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }

  if (sites.length === 0) return [];

  const rows = await Promise.all(
    sites.map(async (site) => {
      const [totalProducts, totalContent, clicks7d, clicksPrev7d, lastPublishedAt] =
        await Promise.all([
          countProducts({ siteId: site.id }, getClient).catch(() => 0),
          countContent({ siteId: site.id }, getClient).catch(() => 0),
          getClickCount(site.id, sevenDaysAgo, undefined, getClient).catch(() => 0),
          getClickCount(site.id, fourteenDaysAgo, sevenDaysAgo, getClient).catch(() => 0),
          getLastPublishedAt(site.id, getClient).catch(() => null),
        ]);

      return {
        site_id: site.id,
        total_products: totalProducts,
        total_content: totalContent,
        clicks_7d: clicks7d,
        clicks_prev_7d: clicksPrev7d,
        last_published_at: lastPublishedAt,
        subscriber_count: 0,
      } satisfies NicheHealthRow;
    }),
  );

  return rows;
}
