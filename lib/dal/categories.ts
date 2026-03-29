import { getServiceClient } from "@/lib/supabase-server";
import type { CategoryRow } from "@/types/database";

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
  return data as CategoryRow[];
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
  return (data as unknown as CategoryRow) ?? null;
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
  return (data as unknown as CategoryRow) ?? null;
}

/** Create a category */
export async function createCategory(
  input: Omit<CategoryRow, "id" | "created_at">,
): Promise<CategoryRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input as never).select().single();
  if (error) throw error;
  return data as CategoryRow;
}

/** Update a category */
export async function updateCategory(
  siteId: string,
  id: string,
  input: Partial<Pick<CategoryRow, "name" | "slug" | "description">>,
): Promise<CategoryRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input as never)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as CategoryRow;
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
