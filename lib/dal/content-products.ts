import type { ContentProductRow, ProductRow } from "@/types/database";
import { assertRows } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "content_products";

/** Get all linked products for a content item (with full product data, scoped to site) */
export async function getLinkedProducts(
  siteId: string,
  contentId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<(ContentProductRow & { product: ProductRow })[]> {
  const sb = await getClient();
  // Join through products to ensure only products belonging to this site are returned
  const { data, error } = await sb
    .from(TABLE)
    .select(
      "content_id, product_id, role, product:products!inner(id, site_id, name, slug, description, affiliate_url, image_url, image_alt, price, price_amount, price_currency, merchant, score, featured, status, category_id, cta_text, deal_text, deal_expires_at, pros, cons, version, created_at, updated_at)",
    )
    .eq("content_id", contentId)
    .eq("product.site_id", siteId)
    .order("content_id", { ascending: true });

  if (error) throw error;
  return assertRows<ContentProductRow & { product: ProductRow }>(data);
}

/**
 * Replace all linked products for a content item.
 *
 * content_products has no `site_id` column — isolation is enforced by
 * verifying BOTH the target content row and every candidate product row
 * belong to the caller's active site before any write.
 *
 * Without these checks, any authenticated admin could mutate links on
 * another site's content simply by supplying its UUID.
 */
export async function setLinkedProducts(
  contentId: string,
  siteId: string,
  links: Omit<ContentProductRow, "content_id">[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();

  const { error } = await sb.rpc("set_linked_products", {
    p_site_id: siteId,
    p_content_id: contentId,
    p_links: links,
  });

  if (error) {
    throw new Error(error.message || "Failed to set linked products");
  }
}
