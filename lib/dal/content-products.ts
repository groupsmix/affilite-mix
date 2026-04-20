import { getServiceClient, getAnonClient } from "@/lib/supabase-server";
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

/** Unlink a product from a content item */
export async function unlinkProduct(contentId: string, productId: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("content_id", contentId)
    .eq("product_id", productId);

  if (error) throw error;
}

/** Get all linked products for a content item (with full product data) */
export async function getLinkedProducts(
  contentId: string,
): Promise<(ContentProductRow & { product: ProductRow })[]> {
  const sb = getAnonClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*, product:products(*)")
    .eq("content_id", contentId)
    .order("content_id", { ascending: true });

  if (error) throw error;
  return assertRows<ContentProductRow & { product: ProductRow }>(data);
}

/** Update link metadata (role) */
export async function updateProductLink(
  contentId: string,
  productId: string,
  input: Partial<Pick<ContentProductRow, "role">>,
): Promise<ContentProductRow> {
  const sb = getServiceClient();
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

/** Get content items that link to a given product */
export async function getRelatedContentForProduct(productId: string): Promise<ContentRow[]> {
  const sb = getAnonClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("content:content(*)")
    .eq("product_id", productId);

  if (error) throw error;
  return assertRows<{ content: ContentRow }>(data ?? [])
    .map((row) => row.content)
    .filter(Boolean);
}

/**
 * Replace all linked products for a content item.
 *
 * SECURITY: `content_products` has no `site_id` column, so we MUST verify that
 * both the target content row and every product referenced in `links` belong
 * to the caller's site. Without these checks, an admin of site A could mutate
 * links on site B's content just by guessing UUIDs.
 */
export async function setLinkedProducts(
  contentId: string,
  siteId: string,
  links: Omit<ContentProductRow, "content_id">[],
): Promise<void> {
  const sb = getServiceClient();

  // 1. Verify the content row belongs to this site.
  const { data: contentRow, error: contentError } = await sb
    .from("content")
    .select("id")
    .eq("id", contentId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (contentError) throw contentError;
  if (!contentRow) {
    throw new Error("Content not found for this site");
  }

  // 2. Verify every linked product also belongs to this site.
  if (links.length > 0) {
    const productIds = [...new Set(links.map((l) => l.product_id))];
    const { data: ownedProducts, error: productError } = await sb
      .from("products")
      .select("id")
      .eq("site_id", siteId)
      .in("id", productIds);

    if (productError) throw productError;
    if (!ownedProducts || ownedProducts.length !== productIds.length) {
      throw new Error("One or more products do not belong to this site");
    }
  }

  // 3. Replace links atomically enough: delete then insert.
  const { error: delError } = await sb.from(TABLE).delete().eq("content_id", contentId);
  if (delError) throw delError;

  if (links.length === 0) return;

  const rows = links.map((link) => ({
    ...link,
    content_id: contentId,
  }));

  const { error: insError } = await sb.from(TABLE).insert(rows);
  if (insError) throw insError;
}
