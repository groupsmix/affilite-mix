import { getPrivilegedDalClient, type DalClientGetter } from "@/lib/dal/dal-client";
import { untypedFrom } from "@/lib/dal/type-guards";
import type { AffiliateLinkHealthRow } from "@/types/database";

export interface OptimizationSiteRow {
  id: string;
}

export interface OptimizationProductRow {
  id: string;
  site_id: string;
  category_id: string | null;
  affiliate_url: string | null;
  featured: boolean;
  status: string;
}

export interface OptimizationEpcRow {
  product_id: string;
  network: string;
  clicks_30d: number;
  commissions_30d: number;
  epc_30d: number;
  updated_at: string;
}

export interface OptimizationLinkRow {
  id: string;
  product_id: string;
  network: string;
  url: string;
  is_active: boolean;
}

const privileged: DalClientGetter = getPrivilegedDalClient;

export async function listOptimizationSites(
  getClient: DalClientGetter = privileged,
): Promise<OptimizationSiteRow[]> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, "sites")
    .select("id")
    .eq("is_active", true)
    // SAFE: this is the global active-site registry, read by the cron with a privileged client.
    .unsafeNoSiteFilter();
  if (error) throw error;
  return (data ?? []) as OptimizationSiteRow[];
}

export async function getOptimizationData(
  siteId: string,
  getClient: DalClientGetter = privileged,
): Promise<{
  products: OptimizationProductRow[];
  epc: OptimizationEpcRow[];
  links: OptimizationLinkRow[];
  health: AffiliateLinkHealthRow[];
  pageProducts: Array<{ content_id: string; product_id: string }>;
  latestEpcAt: string | null;
}> {
  const sb = await getClient();
  const [productsResult, epcResult, linksResult, healthResult, pagesResult] = await Promise.all([
    untypedFrom(sb, "products")
      .select("id, site_id, category_id, affiliate_url, featured, status")
      .eq("site_id", siteId),
    untypedFrom(sb, "product_epc_stats")
      .select("product_id, network, clicks_30d, commissions_30d, epc_30d, updated_at")
      .eq("site_id", siteId),
    untypedFrom(sb, "product_affiliate_links")
      .select("id, product_id, network, url, is_active, products!inner(site_id)")
      .eq("products.site_id", siteId)
      .eq("is_active", true)
      // SAFE: the joined product site predicate provides tenant scoping.
      .unsafeNoSiteFilter(),
    untypedFrom(sb, "affiliate_link_health")
      .select(
        "id, site_id, product_id, product_affiliate_link_id, source_type, source_key, source_name, url, network, last_probed_at, last_http_status, final_url, baseline_registrable_domain, latency_ms, consecutive_failures, failure_streak_started_at, classification, created_at, updated_at",
      )
      .eq("site_id", siteId),
    untypedFrom(sb, "content_products")
      .select("content_id, product_id, content!inner(site_id)")
      .eq("content.site_id", siteId)
      // SAFE: the joined content site predicate provides tenant scoping.
      .unsafeNoSiteFilter(),
  ]);
  for (const result of [productsResult, epcResult, linksResult, healthResult, pagesResult]) {
    if (result.error) throw result.error;
  }
  const epc = (epcResult.data ?? []) as OptimizationEpcRow[];
  const latestEpcAt = epc.reduce<string | null>(
    (latest, row) => (latest === null || row.updated_at > latest ? row.updated_at : latest),
    null,
  );
  return {
    products: (productsResult.data ?? []) as OptimizationProductRow[],
    epc,
    links: (linksResult.data ?? []) as OptimizationLinkRow[],
    health: (healthResult.data ?? []) as AffiliateLinkHealthRow[],
    pageProducts: (pagesResult.data ?? []) as Array<{ content_id: string; product_id: string }>,
    latestEpcAt,
  };
}
