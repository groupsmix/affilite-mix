import type { ContentProductRow, ContentRow, ProductRow } from "@/types/database";
import { assertRows } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { getTenantClient } from "@/lib/supabase-server";
import { shouldSkipDbCall } from "@/lib/db-available";

const TABLE = "content_products";

/** Minimal content shape used for building internal links (CA-306). */
export type LinkedContent = Pick<ContentRow, "id" | "title" | "slug" | "type">;

/** A piece of published content together with which of the queried products it references. */
export interface ContentForProduct {
  productId: string;
  content: LinkedContent;
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
      "content_id, product_id, role, product:products!inner(id, site_id, name, slug, description, affiliate_url, image_url, image_alt, price:price_label, price_amount, price_currency, merchant, score, featured, status, category_id, cta_text, deal_text, deal_expires_at, pros, cons, version, created_at, updated_at)",
    )
    .eq("content_id", contentId)
    .eq("product.site_id", siteId)
    .order("content_id", { ascending: true });

  if (error) throw error;
  return assertRows<ContentProductRow & { product: ProductRow }>(data);
}

/**
 * CA-306: Find published content that references any of the given products,
 * via the `content_products` join. Powers the automated "related links" block
 * (e.g. "the reviews of the two tools in this comparison", "comparisons that
 * feature this tool") without any manually-curated links.
 *
 * Tenant isolation: `content_products` has no `site_id`; we enforce it by
 * joining `content!inner` and filtering on `content.site_id`, exactly as
 * `getLinkedProducts` does through `products`.
 *
 * Public read: uses the anon client and returns published rows only, so it is
 * safe to call from the public content page.
 */
export async function getContentLinkedToProducts(
  siteId: string,
  productIds: string[],
  opts: { excludeContentId?: string; types?: string[]; limit?: number } = {},
): Promise<ContentForProduct[]> {
  if (shouldSkipDbCall() || productIds.length === 0) return [];

  const sb = await getTenantClient();
  let query = sb
    .from(TABLE)
    .select("product_id, content:content!inner(id, site_id, title, slug, type, status)")
    .in("product_id", productIds)
    .eq("content.site_id", siteId)
    .eq("content.status", "published");

  if (opts.types && opts.types.length > 0) {
    query = query.in("content.type", opts.types);
  }
  if (opts.excludeContentId) {
    query = query.neq("content.id", opts.excludeContentId);
  }
  // Cap defensively; the builder caps again per group.
  query = query.limit(opts.limit ?? 50);

  const { data, error } = await query;
  if (error) throw error;

  // The embedded `content` comes back as an object (or, defensively, an array
  // depending on the FK shape). Normalize to ContentForProduct[].
  const rows = (data ?? []) as unknown as Array<{
    product_id: string;
    content: LinkedContent | LinkedContent[] | null;
  }>;
  const out: ContentForProduct[] = [];
  for (const row of rows) {
    const c = Array.isArray(row.content) ? row.content[0] : row.content;
    if (!c) continue;
    out.push({
      productId: row.product_id,
      content: { id: c.id, title: c.title, slug: c.slug, type: c.type },
    });
  }
  return out;
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
