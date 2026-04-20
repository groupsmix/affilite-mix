import { getServiceClient } from "@/lib/supabase-server";
import type { ContentProductRow, ContentRow, ProductRow } from "@/types/database";
import { assertRow, assertRows } from "./type-guards";

const TABLE = "content_products";

/** Link a product to a content item */
export async function linkProduct(input: ContentProductRow): Promise<ContentProductRow> {
  const sb = getServiceClient();
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
  const sb = getServiceClient();

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
  const sb = getServiceClient();
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
  const sb = getServiceClient();

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
  const sb = getServiceClient();
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
  const sb = getServiceClient();

  // 1. Verify the content belongs to this site.
  const { data: contentRow, error: contentErr } = await sb
    .from("content")
    .select("id")
    .eq("id", contentId)
    .eq("site_id", siteId)
    .maybeSingle();
  if (contentErr) throw contentErr;
  if (!contentRow) {
    throw new Error("Content not found for this site");
  }

  // 2. Verify every referenced product belongs to this site.
  if (links.length > 0) {
    const productIds = Array.from(new Set(links.map((l) => l.product_id)));
    const { data: ownedProducts, error: productErr } = await sb
      .from("products")
      .select("id")
      .eq("site_id", siteId)
      .in("id", productIds);
    if (productErr) throw productErr;

    const ownedIds = new Set((ownedProducts ?? []).map((p: { id: string }) => p.id));
    const foreign = productIds.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) {
      throw new Error("One or more products do not belong to this site");
    }
  }

  // 3. Delete existing links for this content (content ownership already verified).
  const { error: delError } = await sb.from(TABLE).delete().eq("content_id", contentId);
  if (delError) throw delError;

  if (links.length === 0) return;

  // 4. Insert new links.
  const rows = links.map((link) => ({
    ...link,
    content_id: contentId,
  }));

  const { error: insError } = await sb.from(TABLE).insert(rows);
  if (insError) throw insError;
}
