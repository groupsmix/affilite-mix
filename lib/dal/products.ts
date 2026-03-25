import { getServiceClient } from "@/lib/supabase-server";
import type { ProductRow } from "@/types/database";

const TABLE = "products";

export interface ListProductsOptions {
  siteId: string;
  categoryId?: string;
  status?: ProductRow["status"];
  featured?: boolean;
  limit?: number;
  offset?: number;
}

/** List products for a site with optional filters */
export async function listProducts(
  opts: ListProductsOptions,
): Promise<ProductRow[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", opts.siteId)
    .order("created_at", { ascending: false });

  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.featured !== undefined) query = query.eq("is_featured", opts.featured);
  if (opts.limit) query = query.limit(opts.limit);
  if (opts.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 20) - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data as ProductRow[];
}

/** Get a single product by id */
export async function getProductById(
  siteId: string,
  id: string,
): Promise<ProductRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as ProductRow) ?? null;
}

/** Get a single product by slug */
export async function getProductBySlug(
  siteId: string,
  slug: string,
): Promise<ProductRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as ProductRow) ?? null;
}

/** Create a product */
export async function createProduct(
  input: Omit<ProductRow, "id" | "created_at" | "updated_at">,
): Promise<ProductRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return data as ProductRow;
}

/** Update a product */
export async function updateProduct(
  siteId: string,
  id: string,
  input: Partial<
    Omit<ProductRow, "id" | "site_id" | "created_at" | "updated_at">
  >,
): Promise<ProductRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ProductRow;
}

/** Delete a product */
export async function deleteProduct(
  siteId: string,
  id: string,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("site_id", siteId)
    .eq("id", id);

  if (error) throw error;
}

/** List active products for public pages */
export async function listActiveProducts(
  siteId: string,
  categorySlug?: string,
): Promise<ProductRow[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*, categories!inner(slug)")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .eq("status", "active")
    .order("score", { ascending: false, nullsFirst: false });

  if (categorySlug) {
    query = query.eq("categories.slug", categorySlug);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as ProductRow[];
}

/** List featured products for a site */
export async function listFeaturedProducts(
  siteId: string,
  limit = 6,
): Promise<ProductRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .eq("is_featured", true)
    .eq("status", "active")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return data as ProductRow[];
}
