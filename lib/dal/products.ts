import { getTenantClient } from "@/lib/supabase-server";
import type { ProductRow } from "@/types/database";
import { escapeLike, toTsquery } from "./search-utils";
import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { shouldSkipDbCall } from "@/lib/db-available";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { clampPagination } from "./pagination-guard";
import { getEpcByProductIds } from "./commissions";
import { applyEpcTieBreak } from "@/lib/ranking/epc-tie-break";

const TABLE = "products";
// A23-01: Full explicit column list. Update this constant (and ProductRow in
// types/database.ts) whenever a column is added so select("*") never silently
// over-returns new sensitive columns.
// DB-11 / migration 00089 renamed the column `price` -> `price_label` (display
// text). ProductRow keeps the app-facing `price` field, so reads alias the real
// column back to `price` via PostgREST (`price:price_label`) and writes are
// translated by toProductDbWrite() below. Selecting a literal `price` here would
// 400 ("column products.price does not exist") on any DB where 00089 has run.
const LIST_COLUMNS =
  "id, site_id, name, slug, description, affiliate_url, image_url, image_alt, price:price_label, price_amount, price_currency, merchant, score, featured, status, category_id, category_ids, cta_text, deal_text, deal_expires_at, pros, cons, version, created_at, updated_at" as const;

/**
 * Translate the app-facing `price` field to the real DB column `price_label`
 * (renamed in migration 00089) for INSERT/UPDATE payloads. Only rewrites the key
 * when present, so partial updates that omit `price` are unaffected.
 */
function toProductDbWrite<T extends object>(input: T): Record<string, unknown> {
  const obj = { ...(input as Record<string, unknown>) };
  if ("price" in obj) {
    obj.price_label = obj.price;
    delete obj.price;
  }
  return obj;
}

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
  categoryId?: string;
  categoryIds?: string[];
  status?: ProductRow["status"];
  statuses?: ProductRow["status"][];
  networks?: string[];
  featured?: boolean;
  q?: string;
  missingUrl?: boolean;
  sortBy?: ProductSortColumn;
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export type CountProductsOptions = Omit<
  ListProductsOptions,
  "limit" | "offset" | "sortBy" | "sortDirection"
>;

export async function listProducts(
  opts: ListProductsOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductRow[]> {
  const sb = await getClient();

  const allowedSortColumns: ProductSortColumn[] = [
    "name",
    "price_amount",
    "score",
    "merchant",
    "status",
    "created_at",
    "updated_at",
  ];

  const sortColumn: ProductSortColumn =
    opts.sortBy && allowedSortColumns.includes(opts.sortBy) ? opts.sortBy : "created_at";

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
    query = query.or("affiliate_url.is.null,affiliate_url.eq.");
  }
  // S4-A98.2: Clamp pagination to prevent integer overflow at extreme offsets.
  const { limit: safeLimit, offset: safeOffset } = clampPagination(opts);
  if (safeOffset > 0) {
    query = query.range(safeOffset, safeOffset + safeLimit - 1);
  } else {
    query = query.limit(safeLimit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<ProductRow>(data);
}

export async function countProducts(
  opts: CountProductsOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  if (shouldSkipDbCall()) {
    return 0;
  }
  const sb = await getClient();
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

export async function listDistinctMerchants(
  siteId: string,
  opts: { limit?: number; offset?: number } = {},
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<string[]> {
  if (shouldSkipDbCall()) {
    return [];
  }
  const sb = await getClient();
  const { limit, offset } = clampPagination(opts);

  let query = sb
    .from(TABLE)
    .select("merchant")
    .eq("site_id", siteId)
    .not("merchant", "is", null)
    .neq("merchant", "")
    .order("merchant", { ascending: true });

  if (offset > 0) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(limit);
  }

  const { data, error } = await query;
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

export async function getProductById(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ProductRow>(data);
}

export async function getProductBySlug(
  siteId: string,
  slug: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ProductRow>(data);
}

/**
 * ISO18-001: Optimistic locking — if `expectedVersion` is supplied, the update
 * will only succeed when the current row's `version` matches. On mismatch a
 * ConflictError is thrown so the caller can inform the user about the stale write.
 */
export class ConflictError extends Error {
  public readonly code = "CONFLICT";
  constructor(message = "Concurrent modification detected — please refresh and retry") {
    super(message);
    this.name = "ConflictError";
  }
}

export async function createProduct(
  input: Omit<ProductRow, "id" | "created_at" | "updated_at" | "version">,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductRow> {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).insert(toProductDbWrite(input)).select().single();
  if (error) throw error;
  return assertRow<ProductRow>(data, "Product");
}

export async function bulkCreateProducts(
  inputs: Omit<ProductRow, "id" | "created_at" | "updated_at" | "version">[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ProductRow[]> {
  if (inputs.length === 0) return [];
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).insert(inputs.map(toProductDbWrite)).select();
  if (error) throw error;
  return assertRows<ProductRow>(data);
}

export async function updateProduct(
  siteId: string,
  id: string,
  input: Partial<Omit<ProductRow, "id" | "site_id" | "created_at" | "updated_at" | "version">>,
  getClient: DalClientGetter = defaultDalClientGetter,
  /** ISO18-001: Pass the version the client last read to enable optimistic lock. */
  expectedVersion?: number,
): Promise<ProductRow> {
  const sb = await getClient();

  // P0-FIX (A97): Never set version to a literal value from the client.
  // When expectedVersion is supplied, filter on it to detect conflicts.
  // The version column is always incremented atomically via a DB trigger
  // (or fallback: version = version + 1 via RPC). When no expectedVersion
  // is supplied, we simply don't filter on version (no optimistic lock).
  let query = sb.from(TABLE).update(toProductDbWrite(input)).eq("site_id", siteId).eq("id", id);

  // ISO18-001: When the caller supplies an expected version, add it as a
  // filter. If the row's version differs (concurrent edit) the update will
  // match zero rows and PostgREST returns PGRST116.
  if (expectedVersion !== undefined) {
    query = query.eq("version", expectedVersion);
  }

  const { data, error } = await query.select().single();

  if (error) {
    // PGRST116 = "JSON object requested, multiple (or no) rows returned"
    // When optimistic lock is active, this means the version didn't match.
    if (error.code === "PGRST116" && expectedVersion !== undefined) {
      throw new ConflictError();
    }
    throw error;
  }
  return assertRow<ProductRow>(data, "Product");
}

export async function deleteProduct(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}

export interface ListActiveProductsOptions {
  /**
   * When true, apply the EPC tie-break (lib/ranking/epc-tie-break.ts): within a
   * band of near-equal scores, surface the higher-EPC tool first. Merit always
   * wins across bands. Off by default so the public anon path is unchanged.
   *
   * Activation requires EPC read access. `product_epc_stats` has no anon SELECT
   * policy, so on the public anon path this is a safe no-op (pure score order).
   * To make it live on public pages, either pass a privileged `getClient`, or
   * denormalize an anon-readable rank hint via the cron (backlog T-03a).
   */
  epcTieBreak?: boolean;
  /** Client used to read EPC stats. Defaults to the request-scoped client. */
  getClient?: DalClientGetter;
  /** Score-noise band for the tie-break (0–10 scale). Defaults to 0.5. */
  scoreBand?: number;
}

export async function listActiveProducts(
  siteId: string,
  categorySlug?: string,
  opts?: ListActiveProductsOptions,
): Promise<ProductRow[]> {
  if (shouldSkipDbCall()) {
    return [];
  }
  const sb = await getTenantClient();
  const joinType = categorySlug ? "categories!inner(slug)" : "*, categories(slug)";
  // DB-11/00089: expose the renamed `price_label` column under the app-facing
  // `price` key so product.price is populated on the public anon path too
  // (this path uses select("*"), which would otherwise only return price_label).
  const selectColumns = `${categorySlug ? `*, ${joinType}` : joinType}, price:price_label`;

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
  const rows = assertRows<ProductRow>(data);

  // Merit-first ordering with an optional EPC tie-break. EPC is read server-side
  // and used only to reorder — the values are never returned to the client.
  if (!opts?.epcTieBreak || rows.length < 2) {
    return rows;
  }
  const epcById = await getEpcByProductIds(
    siteId,
    rows.map((r) => r.id),
    opts.getClient ?? defaultDalClientGetter,
  );
  if (epcById.size === 0) {
    // No EPC visibility (e.g. the public anon path) — keep pure score order.
    return rows;
  }
  return applyEpcTieBreak(rows, epcById, { scoreBand: opts.scoreBand });
}

/** A73-F2: Cap search query length to prevent expensive trigram query plans. */
const MAX_SEARCH_QUERY_LENGTH = 200;

export async function searchProducts(
  siteId: string,
  query: string,
  limit = 20,
): Promise<ProductRow[]> {
  // A73-F2: Truncate overly long search queries to prevent expensive DB plans
  const trimmedQuery = query.slice(0, MAX_SEARCH_QUERY_LENGTH);
  const sb = await getTenantClient();
  const tsq = toTsquery(trimmedQuery);

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
  }

  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "active")
    .ilike("name", `%${escapeLike(trimmedQuery)}%`)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) throw error;
  return assertRows<ProductRow>(data);
}

/** D-01: Maximum number of names per IN clause to prevent oversized queries. */
const MAX_IN_NAMES = 100;

export async function listProductsByNames(
  siteId: string,
  names: string[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Pick<ProductRow, "id" | "name" | "image_url" | "image_alt">[]> {
  if (names.length === 0) return [];
  const sb = await getClient();
  // D-01: Paginate large name lists to avoid massive IN clauses
  const capped = names.slice(0, MAX_IN_NAMES);
  const results: Pick<ProductRow, "id" | "name" | "image_url" | "image_alt">[] = [];
  for (let i = 0; i < capped.length; i += MAX_IN_NAMES) {
    const batch = capped.slice(i, i + MAX_IN_NAMES);
    const { data, error } = await sb
      .from(TABLE)
      .select("id, name, image_url, image_alt")
      .eq("site_id", siteId)
      .in("name", batch);
    if (error) throw error;
    results.push(...assertRows<Pick<ProductRow, "id" | "name" | "image_url" | "image_alt">>(data));
  }
  return results;
}

export async function listFeaturedProducts(siteId: string, limit = 6): Promise<ProductRow[]> {
  if (shouldSkipDbCall()) {
    return [];
  }
  const sb = await getTenantClient();
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
