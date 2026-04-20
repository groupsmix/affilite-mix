import { getServiceClient } from "@/lib/supabase-server";
import type { CategoryRow, TaxonomyType } from "@/types/database";
import { assertRows, assertRow, rowOrNull, hasStringProp } from "./type-guards";

const TABLE = "categories";

const FULL_COLUMNS = "id, site_id, name, slug, description, taxonomy_type, created_at" as const;
const NO_DESCRIPTION_COLUMNS = "id, site_id, name, slug, taxonomy_type, created_at" as const;
const MIN_COLUMNS = "id, site_id, name, slug, created_at" as const;

function normalizeCategoryRows(rows: unknown[] | null): CategoryRow[] {
  const safeRows = assertRows<Record<string, unknown>>(rows);
  return safeRows.map((row) => ({
    id: String(row.id),
    site_id: String(row.site_id),
    name: String(row.name),
    slug: String(row.slug),
    description: typeof row.description === "string" ? row.description : "",
    taxonomy_type: (row.taxonomy_type as TaxonomyType) ?? "general",
    created_at: String(row.created_at),
  }));
}

/** List all categories for a site, ordered by name */
export async function listCategories(siteId: string): Promise<CategoryRow[]> {
  // Return empty if Supabase is not configured (placeholder URL)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return [];
  }
  const sb = getServiceClient();
  let result: { data: unknown[] | null; error: { message?: string } | null } = (await sb
    .from(TABLE)
    .select(FULL_COLUMNS)
    .eq("site_id", siteId)
    .order("name", { ascending: true })) as unknown as {
    data: unknown[] | null;
    error: { message?: string } | null;
  };

  if (result.error) {
    const msg = result.error.message ?? "";
    if (msg.includes("description")) {
      result = (await sb
        .from(TABLE)
        .select(NO_DESCRIPTION_COLUMNS)
        .eq("site_id", siteId)
        .order("name", { ascending: true })) as unknown as {
        data: unknown[] | null;
        error: { message?: string } | null;
      };
    } else if (msg.includes("taxonomy_type")) {
      result = (await sb
        .from(TABLE)
        .select(MIN_COLUMNS)
        .eq("site_id", siteId)
        .order("name", { ascending: true })) as unknown as {
        data: unknown[] | null;
        error: { message?: string } | null;
      };
    }
  }

  if (result.error) throw result.error;
  return normalizeCategoryRows(result.data);
}

/** List categories for a site filtered by taxonomy type */
export async function listCategoriesByTaxonomy(
  siteId: string,
  taxonomyType: TaxonomyType,
): Promise<CategoryRow[]> {
  const sb = getServiceClient();
  // Return empty if Supabase is not configured (placeholder URL)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return [];
  }
  let result: { data: unknown[] | null; error: { message?: string } | null } = (await sb
    .from(TABLE)
    .select(FULL_COLUMNS)
    .eq("site_id", siteId)
    .eq("taxonomy_type", taxonomyType)
    .order("name", { ascending: true })) as unknown as {
    data: unknown[] | null;
    error: { message?: string } | null;
  };

  if (result.error) {
    const msg = result.error.message ?? "";
    if (msg.includes("taxonomy_type")) return [];
    if (msg.includes("description")) {
      result = (await sb
        .from(TABLE)
        .select(NO_DESCRIPTION_COLUMNS)
        .eq("site_id", siteId)
        .eq("taxonomy_type", taxonomyType)
        .order("name", { ascending: true })) as unknown as {
        data: unknown[] | null;
        error: { message?: string } | null;
      };
      if (result.error && (result.error.message ?? "").includes("taxonomy_type")) return [];
    }
  }

  if (result.error) return [];
  return normalizeCategoryRows(result.data);
}

/** Get a single category by id */
export async function getCategoryById(siteId: string, id: string): Promise<CategoryRow | null> {
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
export async function getCategoryBySlug(siteId: string, slug: string): Promise<CategoryRow | null> {
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
  // Return empty if Supabase is not configured (placeholder URL)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return [];
  }

  let catsResult: { data: unknown[] | null; error: { message?: string } | null } = (await sb
    .from(TABLE)
    .select(FULL_COLUMNS)
    .eq("site_id", siteId)
    .order("name", { ascending: true })) as unknown as {
    data: unknown[] | null;
    error: { message?: string } | null;
  };
  if (catsResult.error) {
    const msg = catsResult.error.message ?? "";
    if (msg.includes("description")) {
      catsResult = (await sb
        .from(TABLE)
        .select(NO_DESCRIPTION_COLUMNS)
        .eq("site_id", siteId)
        .order("name", { ascending: true })) as unknown as {
        data: unknown[] | null;
        error: { message?: string } | null;
      };
    } else if (msg.includes("taxonomy_type")) {
      catsResult = (await sb
        .from(TABLE)
        .select(MIN_COLUMNS)
        .eq("site_id", siteId)
        .order("name", { ascending: true })) as unknown as {
        data: unknown[] | null;
        error: { message?: string } | null;
      };
    }
  }

  if (catsResult.error) return [];

  const { data: counts, error: countError } = await sb
    .from("products")
    .select("category_id")
    .eq("site_id", siteId)
    .eq("status", "active")
    .not("category_id", "is", null);

  if (countError)
    return normalizeCategoryRows(catsResult.data).map((cat) => ({ ...cat, product_count: 0 }));

  const countMap = new Map<string, number>();
  for (const row of counts ?? []) {
    if (hasStringProp(row, "category_id")) {
      countMap.set(row.category_id, (countMap.get(row.category_id) ?? 0) + 1);
    }
  }

  return normalizeCategoryRows(catsResult.data)
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

/** Count content and products associated with a category */
export async function getCategoryUsageCounts(
  siteId: string,
  categoryId: string,
): Promise<{ contentCount: number; productCount: number }> {
  const sb = getServiceClient();

  const [contentResult, productResult] = await Promise.all([
    sb
      .from("content")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("category_id", categoryId),
    sb
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("site_id", siteId)
      .eq("category_id", categoryId),
  ]);

  return {
    contentCount: contentResult.count ?? 0,
    productCount: productResult.count ?? 0,
  };
}

/** Delete a category */
export async function deleteCategory(siteId: string, id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);

  if (error) throw error;
}
