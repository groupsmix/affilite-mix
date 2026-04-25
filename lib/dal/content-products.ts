import { getTenantClient } from "@/lib/supabase-server";
import type { ContentProductRow, ContentRow, ProductRow } from "@/types/database";
import { assertRow, assertRows } from "./type-guards";

const TABLE = "content_products";

/** Link a product to a content item */
export async function linkProduct(input: ContentProductRow): Promise<ContentProductRow> {
  const sb = await getTenantClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<ContentProductRow>(data, "ContentProduct");
}

/** Unlink a product from a content item (verifies content belongs to site) */
export async function unlinkProduct(
  siteId: string,
  contentId: string,
  productId: string,
): Promise<void> {
  const sb = await getTenantClient();

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
): Promise<(ContentProductRow & { product: ProductRow })[]> {
  const sb = await getTenantClient();
  // Join through products to ensure only products belonging to this site are returned
  const { data, error } = await sb
    .from(TABLE)
    .select("*, product:products!inner(*)")
    .eq("content_id", contentId)
    .eq("product.site_id", siteId)
    .order("content_id", { ascending: true });

  if (error) throw error;
  return assertRows<ContentProductRow & { product: ProductRow }>(data);
}

/** Update link metadata (role) — verifies content belongs to site */
export async function updateProductLink(
  siteId: string,
  contentId: string,
  productId: string,
  input: Partial<Pick<ContentProductRow, "role">>,
): Promise<ContentProductRow> {
  const sb = await getTenantClient();

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
export async function getRelatedContentForProduct(
  siteId: string,
  productId: string,
): Promise<ContentRow[]> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("content:content!inner(*)")
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
): Promise<void> {
  const sb = await getTenantClient();

  // @ts-ignore - The RPC is defined in migration 00057 but not yet generated in the local types
  const { error } = await sb.rpc("set_linked_products", {
    p_site_id: siteId,
    p_content_id: contentId,
    p_links: links,
  });

  if (error) {
    throw new Error(error.message || "Failed to set linked products");
  }
}
