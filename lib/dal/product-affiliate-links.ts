import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow } from "./type-guards";

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

/** List active affiliate links for a product, ordered by weight descending */
export async function listProductAffiliateLinks(
  productId: string,
): Promise<ProductAffiliateLinkRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("weight", { ascending: false });

  if (error) throw error;
  return assertRows<ProductAffiliateLinkRow>(data);
}

/** List all affiliate links for a product (including inactive) */
export async function listAllProductAffiliateLinks(
  productId: string,
): Promise<ProductAffiliateLinkRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("product_id", productId)
    .order("weight", { ascending: false });

  if (error) throw error;
  return assertRows<ProductAffiliateLinkRow>(data);
}

/** Create an affiliate link for a product */
export async function createProductAffiliateLink(input: {
  product_id: string;
  network: string;
  geo?: string;
  url: string;
  weight?: number;
}): Promise<ProductAffiliateLinkRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();

  if (error) throw error;
  return assertRow<ProductAffiliateLinkRow>(data, "ProductAffiliateLink");
}

/** Update an affiliate link */
export async function updateProductAffiliateLink(
  id: string,
  input: Partial<Pick<ProductAffiliateLinkRow, "network" | "geo" | "url" | "weight" | "is_active">>,
): Promise<ProductAffiliateLinkRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).update(input).eq("id", id).select().single();

  if (error) throw error;
  return assertRow<ProductAffiliateLinkRow>(data, "ProductAffiliateLink");
}

/** Delete an affiliate link */
export async function deleteProductAffiliateLink(id: string): Promise<void> {
  const sb = getServiceClient();
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
): Promise<ProductAffiliateLinkRow | null> {
  const links = await listProductAffiliateLinks(productId);
  if (links.length === 0) return null;

  const geoMatches = links.filter((l) => l.geo === geo);
  if (geoMatches.length > 0) return geoMatches[0];

  const wildcardMatches = links.filter((l) => l.geo === "*");
  if (wildcardMatches.length > 0) return wildcardMatches[0];

  return links[0];
}
