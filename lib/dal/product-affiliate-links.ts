// DESIGN: No site_id filtering — operates on product_affiliate_links within already-scoped product contexts.
import { assertRow, assertRows } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

export interface ProductAffiliateLinkRow {
  id: string;
  product_id: string;
  network: string;
  geo: string;
  url: string;
  weight: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "product_affiliate_links";
// A23-01: Explicit column list — update when columns are added to this table.
const ALL_COLUMNS =
  "id, product_id, network, geo, url, weight, is_active, created_at, updated_at" as const;

/** List active affiliate links for a product, ordered by weight descending */
async function listProductAffiliateLinks(
  productId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductAffiliateLinkRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("weight", { ascending: false });

  if (error) throw error;
  return assertRows<ProductAffiliateLinkRow>(data);
}

/**
 * Pick the best affiliate link for a product given a geo code.
 * Priority: exact geo match by weight > wildcard ('*') by weight > null.
 */
export async function pickBestAffiliateLink(
  productId: string,
  geo: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductAffiliateLinkRow | null> {
  const links = await listProductAffiliateLinks(productId, getClient);
  if (links.length === 0) return null;

  const geoMatches = links.filter((l) => l.geo === geo);
  if (geoMatches.length > 0) return geoMatches[0]!;

  const wildcardMatches = links.filter((l) => l.geo === "*");
  if (wildcardMatches.length > 0) return wildcardMatches[0]!;

  return links[0]!;
}

type ProductAffiliateLinkInsert = Omit<ProductAffiliateLinkRow, "id" | "created_at" | "updated_at">;

/**
 * Upsert an affiliate link for a product keyed by (product_id, network, geo).
 * Returns the row with any server-default timestamps / IDs populated.
 */
export async function upsertProductAffiliateLink(
  input: ProductAffiliateLinkInsert,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductAffiliateLinkRow> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .upsert(input, { onConflict: "product_id, network, geo", ignoreDuplicates: false })
    .select(ALL_COLUMNS)
    .single();

  if (error) throw error;
  return assertRow<ProductAffiliateLinkRow>(data, "ProductAffiliateLink");
}
