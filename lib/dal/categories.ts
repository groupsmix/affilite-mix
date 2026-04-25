import { getServiceClient, getAnonClient } from "@/lib/supabase-server";
import type { CategoryRow, TaxonomyType } from "@/types/database";
import { assertRows, assertRow, rowOrNull, hasStringProp } from "./type-guards";
import { shouldSkipDbCall } from "@/lib/db-available";

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

export interface ListCategoriesOptions {
  /**
   * Optional case-insensitive substring filter applied to `name`.
   * Empty/whitespace-only values are ignored and treated as no filter.
   * `%` and `_` are escaped so callers can pass raw user input safely.
   */
  q?: string;
}

/** Escape `%` and `_` so user input doesn't act as wildcards in an ILIKE pattern. */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/**
 * Normalize a search term into an ILIKE pattern, or `null` if the term is empty.
 * Exported for tests.
 */
export function buildCategoryNameIlikePattern(q: string | undefined): string | null {
  if (typeof q !== "string") return null;
  const trimmed = q.trim();
  if (!trimmed) return null;
  return `%${escapeLikePattern(trimmed)}%`;
}

// Chain-builder shared by `listCategories` so the base query (and optional
// filters) are applied identically across each column-fallback attempt.
type CategoriesQueryBuilder = {
  eq: (col: string, val: string) => CategoriesQueryBuilder;
  ilike: (col: string, pattern: string) => CategoriesQueryBuilder;
  order: (
    col: string,
    opts: { ascending: boolean },
  ) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
};

/** List all categories for a site, ordered by name. */
export async function listCategories(
  siteId: string,
  opts: ListCategoriesOptions = {},
): Promise<CategoryRow[]> {
  // Skip DB calls when Supabase is not configured or during next build
  // (SUPABASE_SERVICE_ROLE_KEY is a Worker runtime secret, not available at build time).
  if (shouldSkipDbCall()) {
    return [];
  }
  const sb = getAnonClient();
  const ilikePattern = buildCategoryNameIlikePattern(opts.q);

  const runQuery = async (
    columns: string,
  ): Promise<{ data: unknown[] | null; error: { message?: string } | null }> => {
    const base = sb.from(TABLE).select(columns).eq("site_id", siteId) as unknown as
      | CategoriesQueryBuilder
      | (CategoriesQueryBuilder & {
          order: CategoriesQueryBuilder["order"];
        });
    const filtered = ilikePattern
      ? (base as CategoriesQueryBuilder).ilike("name", ilikePattern)
      : (base as CategoriesQueryBuilder);
    return filtered.order("name", { ascending: true });
  };

  let result = await runQuery(FULL_COLUMNS);

  if (result.error) {
    const msg = result.error.message ?? "";
    if (msg.includes("description")) {
      result = await runQuery(NO_DESCRIPTION_COLUMNS);
    } else if (msg.includes("taxonomy_type")) {
      result = await runQuery(MIN_COLUMNS);
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
  // Skip DB calls when Supabase is not configured or during next build
  // (SUPABASE_SERVICE_ROLE_KEY is a Worker runtime secret, not available at build time).
  if (shouldSkipDbCall()) {
    return [];
  }
  const sb = getAnonClient();
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
  if (shouldSkipDbCall()) {
    return null;
  }

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
  if (shouldSkipDbCall()) {
    return null;
  }

  const sb = getAnonClient();
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
  // Skip DB calls when Supabase is not configured or during next build
  // (SUPABASE_SERVICE_ROLE_KEY is a Worker runtime secret, not available at build time).
  if (shouldSkipDbCall()) {
    return [];
  }

  const sb = getAnonClient();
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

/**
 * Batch-count content and products associated with a set of categories.
 *
 * Performs two `select category_id` queries (one per referencing table)
 * with `.in("category_id", ids)` and groups the results in-memory, so
 * rendering a table of N categories costs O(1) round-trips — not O(N).
 *
 * Every id in `categoryIds` is guaranteed to have an entry in each
 * returned map; categories with no references map to 0.
 *
 * Duplicate / empty / falsy ids are de-duplicated and ignored.
 */
export async function getCategoryUsageCountsBatch(
  siteId: string,
  categoryIds: readonly string[],
): Promise<{
  contentCounts: Map<string, number>;
  productCounts: Map<string, number>;
}> {
  const uniqueIds = Array.from(
    new Set(categoryIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
  );

  const contentCounts = new Map<string, number>(uniqueIds.map((id) => [id, 0]));
  const productCounts = new Map<string, number>(uniqueIds.map((id) => [id, 0]));

  if (uniqueIds.length === 0) {
    return { contentCounts, productCounts };
  }

  // Skip when Supabase is not configured or during next build.
  if (shouldSkipDbCall()) {
    return { contentCounts, productCounts };
  }

  const sb = getServiceClient();

  const [contentResult, productResult] = await Promise.all([
    sb.from("content").select("category_id").eq("site_id", siteId).in("category_id", uniqueIds),
    sb.from("products").select("category_id").eq("site_id", siteId).in("category_id", uniqueIds),
  ]);

  if (!contentResult.error) {
    for (const row of contentResult.data ?? []) {
      if (hasStringProp(row, "category_id") && contentCounts.has(row.category_id)) {
        contentCounts.set(row.category_id, (contentCounts.get(row.category_id) ?? 0) + 1);
      }
    }
  }

  if (!productResult.error) {
    for (const row of productResult.data ?? []) {
      if (hasStringProp(row, "category_id") && productCounts.has(row.category_id)) {
        productCounts.set(row.category_id, (productCounts.get(row.category_id) ?? 0) + 1);
      }
    }
  }

  return { contentCounts, productCounts };
}

/** Count content and products associated with a category */
export async function getCategoryUsageCounts(
  siteId: string,
  categoryId: string,
): Promise<{ contentCount: number; productCount: number }> {
  if (shouldSkipDbCall()) {
    return { contentCount: 0, productCount: 0 };
  }

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
