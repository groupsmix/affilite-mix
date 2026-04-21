import { getServiceClient } from "@/lib/supabase-server";
import type { ProductRow } from "@/types/database";
import { escapeLike, toTsquery } from "./search-utils";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

const TABLE = "products";

// Columns needed for list views (excludes heavy pros/cons/description text)
const LIST_COLUMNS =
  "id, site_id, name, slug, description, affiliate_url, image_url, image_alt, price, price_amount, price_currency, merchant, score, featured, status, category_id, cta_text, deal_text, deal_expires_at, created_at, updated_at" as const;

export type ProductSortColumn =
  | "name"
  | "price_amount"
  | "score"
  | "merchant"
  | "status"
  | "created_at"
  | "updated_at";

export interface ListProductsOptions {
  siteId: string;
  /** Single category filter. Legacy — prefer `categoryIds` for multi-select. */
  categoryId?: string;
  /** Multi-select category filter (applied via Supabase `.in(...)`). */
  categoryIds?: string[];
  /** Single status filter. Legacy — prefer `statuses` for multi-select. */
  status?: ProductRow["status"];
  /** Multi-select status filter (applied via Supabase `.in(...)`). */
  statuses?: ProductRow["status"][];
  /**
   * Multi-select affiliate-network (merchant) filter. Products store the
   * network name in the `merchant` column; this filter is applied via
   * Supabase `.in(...)` against that column.
   */
  networks?: string[];
  featured?: boolean;
  /** Free-text search against `name` (ILIKE, case-insensitive). */
  q?: string;
  /**
   * When true, return only products whose `affiliate_url` is null or empty.
   * Drives the dashboard "missing affiliate URL" quick filter.
   */
  missingUrl?: boolean;
  /** Sort column; defaults to `created_at` descending for backward-compat. */
  sortBy?: ProductSortColumn;
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export type CountProductsOptions = Omit<
  ListProductsOptions,
  "limit" | "offset" | "sortBy" | "sortDirection"
>;

/** List products for a site with optional filters */
export async function listProducts(opts: ListProductsOptions): Promise<ProductRow[]> {
  const sb = getServiceClient();
  const sortColumn: ProductSortColumn = opts.sortBy ?? "created_at";
  const ascending = opts.sortDirection === "asc";

  let query = sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", opts.siteId)
    .order(sortColumn, { ascending, nullsFirst: false });

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    query = query.in("category_id", opts.categoryIds);
  } else if (opts.categoryId) {
    query = query.eq("category_id", opts.categoryId);
  }
  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  } else if (opts.status) {
    query = query.eq("status", opts.status);
  }
  if (opts.networks && opts.networks.length > 0) {
    query = query.in("merchant", opts.networks);
  }
  if (opts.featured !== undefined) query = query.eq("featured", opts.featured);
  if (opts.q && opts.q.trim().length > 0) {
    query = query.ilike("name", `%${escapeLike(opts.q.trim())}%`);
  }
  if (opts.missingUrl) {
    // Match rows where affiliate_url is NULL or empty string.
    query = query.or("affiliate_url.is.null,affiliate_url.eq.");
  }
  if (opts.offset) {
    query = query.range(opts.offset, opts.offset + (opts.limit ?? 20) - 1);
  } else if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<ProductRow>(data);
}

/** Count products matching filters */
export async function countProducts(opts: CountProductsOptions): Promise<number> {
  // Return 0 if Supabase is not configured (placeholder URL)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return 0;
  }
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("site_id", opts.siteId);

  if (opts.categoryIds && opts.categoryIds.length > 0) {
    query = query.in("category_id", opts.categoryIds);
  } else if (opts.categoryId) {
    query = query.eq("category_id", opts.categoryId);
  }
  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  } else if (opts.status) {
    query = query.eq("status", opts.status);
  }
  if (opts.networks && opts.networks.length > 0) {
    query = query.in("merchant", opts.networks);
  }
  if (opts.featured !== undefined) query = query.eq("featured", opts.featured);
  if (opts.q && opts.q.trim().length > 0) {
    query = query.ilike("name", `%${escapeLike(opts.q.trim())}%`);
  }
  if (opts.missingUrl) {
    query = query.or("affiliate_url.is.null,affiliate_url.eq.");
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * List distinct non-empty merchant values for a site. Used to populate the
 * "network" faceted filter in the products admin table.
 */
export async function listDistinctMerchants(siteId: string): Promise<string[]> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return [];
  }
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("merchant")
    .eq("site_id", siteId)
    .not("merchant", "is", null)
    .neq("merchant", "")
    .order("merchant", { ascending: true });
  if (error) throw error;
  const rows = assertRows<{ merchant?: string }>(data);
  const seen = new Set<string>();
  for (const row of rows) {
    if (typeof row.merchant === "string") {
      const m = row.merchant.trim();
      if (m.length > 0) seen.add(m);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b));
}

/** Get a single product by id */
export async function getProductById(siteId: string, id: string): Promise<ProductRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ProductRow>(data);
}

/** Get a single product by slug */
export async function getProductBySlug(siteId: string, slug: string): Promise<ProductRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ProductRow>(data);
}

/** Create a product */
export async function createProduct(
  input: Omit<ProductRow, "id" | "created_at" | "updated_at">,
): Promise<ProductRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<ProductRow>(data, "Product");
}

/** Bulk create products in a single insert (atomic) */
export async function bulkCreateProducts(
  inputs: Omit<ProductRow, "id" | "created_at" | "updated_at">[],
): Promise<ProductRow[]> {
  if (inputs.length === 0) return [];
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(inputs).select();
  if (error) throw error;
  return assertRows<ProductRow>(data);
}

/** Update a product */
export async function updateProduct(
  siteId: string,
  id: string,
  input: Partial<Omit<ProductRow, "id" | "site_id" | "created_at" | "updated_at">>,
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
  return assertRow<ProductRow>(data, "Product");
}

/** Delete a product */
export async function deleteProduct(siteId: string, id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);

  if (error) throw error;
}

/** List active products for public pages */
export async function listActiveProducts(
  siteId: string,
  categorySlug?: string,
): Promise<ProductRow[]> {
  // Return empty if Supabase is not configured (placeholder URL)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return [];
  }
  const sb = getServiceClient();

  // When filtering by category, use !inner join to require a matching category.
  // Otherwise use a left join (default) so products with null category_id are included.
  const joinType = categorySlug ? "categories!inner(slug)" : "*, categories(slug)";
  const selectColumns = categorySlug ? `*, ${joinType}` : joinType;

  let query = sb
    .from(TABLE)
    .select(selectColumns)
    .eq("site_id", siteId)
    .eq("status", "active")
    .order("score", { ascending: false, nullsFirst: false });

  if (categorySlug) {
    query = query.eq("categories.slug", categorySlug);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<ProductRow>(data);
}

/**
 * Search active products using Postgres full-text search.
 * Falls back to ILIKE when FTS is unavailable or the query can't form a valid tsquery.
 */
export async function searchProducts(
  siteId: string,
  query: string,
  limit = 20,
): Promise<ProductRow[]> {
  const sb = getServiceClient();
  const tsq = toTsquery(query);

  if (tsq) {
    const { data, error } = await sb
      .from(TABLE)
      .select(LIST_COLUMNS)
      .eq("site_id", siteId)
      .eq("status", "active")
      .or(`name.fts.${tsq},description.fts.${tsq}`)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(limit);

    if (!error) return assertRows<ProductRow>(data);
    // If FTS fails (e.g. column/index not ready), fall through to ILIKE.
  }

  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "active")
    .ilike("name", `%${escapeLike(query)}%`)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return assertRows<ProductRow>(data);
}

/** List featured products for a site */
export async function listFeaturedProducts(siteId: string, limit = 6): Promise<ProductRow[]> {
  // Return empty if Supabase is not configured (placeholder URL)
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  ) {
    return [];
  }
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("featured", true)
    .eq("status", "active")
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return assertRows<ProductRow>(data);
}
