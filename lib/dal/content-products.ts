import type { ContentProductRow, ContentRow, ProductRow } from "@/types/database";
import { assertRow, assertRows } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "content_products";

/** Link a product to a content item */
async function linkProduct(
  input: ContentProductRow,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentProductRow> {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<ContentProductRow>(data, "ContentProduct");
}

/** Unlink a product from a content item (verifies content belongs to site) */
async function unlinkProduct(
  siteId: string,
  contentId: string,
  productId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();

  // Verify the content belongs to this site
  const { data: contentRow, error: contentErr } = await sb
    .from("content")
    .select("id")
    .eq("id", contentId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (contentErr) throw contentErr;
  if (!contentRow) throw new Error("Content not found for this site");

  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("content_id", contentId)
    .eq("product_id", productId);

  if (error) throw error;
}

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

/** Update link metadata (role) — verifies content belongs to site */
async function updateProductLink(
  siteId: string,
  contentId: string,
  productId: string,
  input: Partial<Pick<ContentProductRow, "role">>,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentProductRow> {
  const sb = await getClient();

  // Verify the content belongs to this site
  const { data: contentRow, error: contentErr } = await sb
    .from("content")
    .select("id")
    .eq("id", contentId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (contentErr) throw contentErr;
  if (!contentRow) throw new Error("Content not found for this site");

  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("content_id", contentId)
    .eq("product_id", productId)
    .select()
    .single();

  if (error) throw error;
  return assertRow<ContentProductRow>(data, "ContentProduct");
}

/** Get content items that link to a given product (scoped to site) */
async function getRelatedContentForProduct(
  siteId: string,
  productId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(
      "content:content!inner(id, site_id, title, slug, body, excerpt, featured_image, type, status, category_id, tags, author, publish_at, meta_title, meta_description, og_image, body_previous, review_state, ai_generated, human_reviewed_at, created_at, updated_at)",
    )
    .eq("product_id", productId)
    .eq("content.site_id", siteId);

  if (error) throw error;
  return assertRows<{ content: ContentRow }>(data ?? [])
    .map((row) => row.content)
    .filter(Boolean);
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
