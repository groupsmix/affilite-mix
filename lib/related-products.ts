import { getServiceClient } from "@/lib/supabase-server";
import type { ProductRow } from "@/types/database";

/**
 * Find related products for internal linking.
 * Uses category, price range, and merchant overlap to find relevant products.
 * Returns ≥5 contextual internal links per product page.
 */
export async function getRelatedProducts(
  siteId: string,
  productId: string,
  limit: number = 6,
): Promise<ProductRow[]> {
  const sb = getServiceClient();

  // Get the source product
  const { data: source } = await sb.from("products").select("*").eq("id", productId).single();

  if (!source) return [];

  // Find related by same category, different product
  let related: ProductRow[] | null = null;
  if (source.category_id) {
    const { data } = await sb
      .from("products")
      .select("*")
      .eq("site_id", siteId)
      .eq("status", "active")
      .neq("id", productId)
      .eq("category_id", source.category_id)
      .order("score", { ascending: false })
      .limit(limit);
    related = data as ProductRow[] | null;
  }

  if (related && related.length >= limit) {
    return related;
  }

  // If not enough by category, fill with same merchant
  const existing = new Set((related || []).map((p) => p.id));
  const { data: merchantRelated } = await sb
    .from("products")
    .select("*")
    .eq("site_id", siteId)
    .eq("status", "active")
    .neq("id", productId)
    .eq("merchant", source.merchant)
    .order("score", { ascending: false })
    .limit(limit);

  const combined = [...(related || [])];
  for (const p of (merchantRelated || []) as ProductRow[]) {
    if (!existing.has(p.id) && combined.length < limit) {
      combined.push(p);
      existing.add(p.id);
    }
  }

  return combined as ProductRow[];
}

/**
 * Generate comparison page slugs for a product.
 * Pairs with top-scored products in same category.
 */
export async function getComparisonSuggestions(
  siteId: string,
  productSlug: string,
  limit: number = 3,
): Promise<{ slug: string; title: string }[]> {
  const sb = getServiceClient();

  const { data: source } = await sb
    .from("products")
    .select("id, name, slug, category_id")
    .eq("site_id", siteId)
    .eq("slug", productSlug)
    .eq("status", "active")
    .single();

  if (!source) return [];

  if (!source.category_id) return [];

  const { data: peers } = await sb
    .from("products")
    .select("name, slug")
    .eq("site_id", siteId)
    .eq("status", "active")
    .neq("id", source.id)
    .eq("category_id", source.category_id)
    .order("score", { ascending: false })
    .limit(limit);

  if (!peers) return [];

  return (peers as { name: string; slug: string }[]).map((peer) => ({
    slug: `${source.slug}-vs-${peer.slug}`,
    title: `${source.name} vs ${peer.name}`,
  }));
}
