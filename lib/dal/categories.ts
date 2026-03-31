import { getServiceClient } from "@/lib/supabase-server";
import type { CategoryRow, TaxonomyType } from "@/types/database";
import { assertRows, assertRow, rowOrNull, hasStringProp } from "./type-guards";

const TABLE = "categories";

/** List all categories for a site, ordered by name */
export async function listCategories(siteId: string): Promise<CategoryRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<CategoryRow>(data);
}

/** List categories for a site filtered by taxonomy type */
export async function listCategoriesByTaxonomy(
  siteId: string,
  taxonomyType: TaxonomyType,
): Promise<CategoryRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("taxonomy_type", taxonomyType)
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<CategoryRow>(data);
}

/** Get a single category by id */
export async function getCategoryById(
  siteId: string,
  id: string,
): Promise<CategoryRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<CategoryRow>(data);
}

/** Get a single category by slug */
export async function getCategoryBySlug(
  siteId: string,
  slug: string,
): Promise<CategoryRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<CategoryRow>(data);
}

/** List categories with product counts, sorted by product count descending */
export async function listCategoriesWithProductCount(
  siteId: string,
): Promise<(CategoryRow & { product_count: number })[]> {
  const sb = getServiceClient();

  // Get all categories
  const { data: cats, error: catError } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("name", { ascending: true });

  if (catError) throw catError;

  // Get product counts per category
  const { data: counts, error: countError } = await sb
    .from("products")
    .select("category_id")
    .eq("site_id", siteId)
    .eq("status", "active")
    .not("category_id", "is", null);

  if (countError) throw countError;

  const countMap = new Map<string, number>();
  for (const row of counts ?? []) {
    if (hasStringProp(row, "category_id")) {
      countMap.set(row.category_id, (countMap.get(row.category_id) ?? 0) + 1);
    }
  }

  return assertRows<CategoryRow>(cats)
    .map((cat) => ({ ...cat, product_count: countMap.get(cat.id) ?? 0 }))
    .sort((a, b) => b.product_count - a.product_count);
}

/** Create a category */
export async function createCategory(
  input: Omit<CategoryRow, "id" | "created_at">,
): Promise<CategoryRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<CategoryRow>(data, "Category");
}

/** Update a category */
export async function updateCategory(
  siteId: string,
  id: string,
  input: Partial<Pick<CategoryRow, "name" | "slug" | "description" | "taxonomy_type">>,
): Promise<CategoryRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<CategoryRow>(data, "Category");
}

/** Delete a category */
export async function deleteCategory(
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
