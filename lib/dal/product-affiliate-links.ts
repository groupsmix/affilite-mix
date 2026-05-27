// DESIGN: No site_id filtering — operates on product_affiliate_links within already-scoped product contexts.
import { assertRows, assertRow } from "./type-guards";
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

/** List all affiliate links for a product (including inactive) */
async function listAllProductAffiliateLinks(
  productId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductAffiliateLinkRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("product_id", productId)
    .order("weight", { ascending: false });

  if (error) throw error;
  return assertRows<ProductAffiliateLinkRow>(data);
}

/** Create an affiliate link for a product */
async function createProductAffiliateLink(
  input: {
    product_id: string;
    network: string;
    geo?: string;
    url: string;
    weight?: number;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductAffiliateLinkRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(TABLE).insert(input).select().single();

  if (error) throw error;
  return assertRow<ProductAffiliateLinkRow>(data, "ProductAffiliateLink");
}

/** Update an affiliate link */
async function updateProductAffiliateLink(
  id: string,
  input: Partial<Pick<ProductAffiliateLinkRow, "network" | "geo" | "url" | "weight" | "is_active">>,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductAffiliateLinkRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(TABLE).update(input).eq("id", id).select().single();

  if (error) throw error;
  return assertRow<ProductAffiliateLinkRow>(data, "ProductAffiliateLink");
}

/** Delete an affiliate link */
async function deleteProductAffiliateLink(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();

  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
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
  if (geoMatches.length > 0) return geoMatches[0];

  const wildcardMatches = links.filter((l) => l.geo === "*");
  if (wildcardMatches.length > 0) return wildcardMatches[0];

  return links[0];
}
