import { getServiceClient } from "@/lib/supabase-server";
import type { ContentProductRow, ProductRow } from "@/types/database";

const TABLE = "content_products";

/** Link a product to a content item */
export async function linkProduct(
  input: ContentProductRow,
): Promise<ContentProductRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return data as ContentProductRow;
}

/** Unlink a product from a content item */
export async function unlinkProduct(
  contentId: string,
  productId: string,
): Promise<void> {
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
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*, product:products(*)")
    .eq("content_id", contentId)
    .order("position", { ascending: true });

  if (error) throw error;
  return data as (ContentProductRow & { product: ProductRow })[];
}

/** Update link metadata (position, role, custom URL) */
export async function updateProductLink(
  contentId: string,
  productId: string,
  input: Partial<Pick<ContentProductRow, "position" | "role" | "custom_aff_url">>,
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
  return data as ContentProductRow;
}

/** Replace all linked products for a content item */
export async function setLinkedProducts(
  contentId: string,
  siteId: string,
  links: Omit<ContentProductRow, "content_id" | "site_id">[],
): Promise<void> {
  const sb = getServiceClient();

  // Delete existing links
  const { error: delError } = await sb
    .from(TABLE)
    .delete()
    .eq("content_id", contentId);

  if (delError) throw delError;

  if (links.length === 0) return;

  // Insert new links
  const rows = links.map((link) => ({
    ...link,
    content_id: contentId,
    site_id: siteId,
  }));

  const { error: insError } = await sb.from(TABLE).insert(rows);
  if (insError) throw insError;
}
