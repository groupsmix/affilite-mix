import { unstable_cache } from "next/cache";
import { getAnonClient } from "@/lib/supabase-server";
import type { ContentRow } from "@/types/database";
import { escapeLike, toTsquery } from "./search-utils";
import { assertRows, assertRow, rowOrNull, hasStringProp } from "./type-guards";
import { shouldSkipDbCall } from "@/lib/db-available";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "content";

export type ContentSortColumn =
  | "title"
  | "publish_at"
  | "status"
  | "author"
  | "created_at"
  | "updated_at";

/** AUDIT-FIX A5-005: Runtime allowlist for sort columns.
 *  TypeScript unions are erased at runtime; an attacker can pass
 *  arbitrary strings via query params. This array is used to validate
 *  the sortBy parameter before it reaches the query builder.
 */
const SORT_COLUMNS: ContentSortColumn[] = [
  "title",
  "publish_at",
  "status",
  "author",
  "created_at",
  "updated_at",
];

/** AUDIT-FIX A5-005: Validate that a user-provided sort column is in the allowlist.
 *  Returns the column if valid, or the default (created_at) if not.
 */
export function sanitizeSortColumn(raw: string | undefined): ContentSortColumn {
  if (!raw) return "created_at";
  return SORT_COLUMNS.includes(raw as ContentSortColumn) ? (raw as ContentSortColumn) : "created_at";
}

export interface ListContentOptions {
  siteId: string;
  /** Single content type filter. Legacy — prefer `types` for multi-select. */
  contentType?: string;
  /** Multi-select content type filter (applied via Supabase `.in(...)`). */
  types?: string[];
  /** Single status filter. Legacy — prefer `statuses` for multi-select. */
  status?: ContentRow["status"];
  /** Multi-select status filter (applied via Supabase `.in(...)`). */
  statuses?: ContentRow["status"][];
  categoryId?: string;
  /** Free-text search against `title` (ILIKE). */
  q?: string;
  /** Sort column; defaults to `created_at` descending for backward-compat. */
  sortBy?: ContentSortColumn;
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export type CountContentOptions = Omit<
  ListContentOptions,
  "limit" | "offset" | "sortBy" | "sortDirection"
>;

// Columns needed for list views (excludes heavy body/body_previous)
const LIST_COLUMNS =
  "id, site_id, title, slug, excerpt, featured_image, type, status, review_state, category_id, tags, author, publish_at, meta_title, meta_description, og_image, created_at, updated_at" as const;

/** List content for a site with optional filters */
export async function listContent(
  opts: ListContentOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow[]> {
  const sb = await getClient();
  // AUDIT-FIX A5-005: Runtime allowlist validation for sort column
  const sortColumn = sanitizeSortColumn(opts.sortBy);
  const ascending = opts.sortDirection === "asc";

  let query = sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", opts.siteId)
    .order(sortColumn, { ascending, nullsFirst: false });

  if (opts.types && opts.types.length > 0) {
    query = query.in("type", opts.types);
  } else if (opts.contentType) {
    query = query.eq("type", opts.contentType);
  }
  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  } else if (opts.status) {
    query = query.eq("status", opts.status);
  }
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  if (opts.q && opts.q.trim().length > 0) {
    query = query.ilike("title", `%${escapeLike(opts.q.trim())}%`);
  }
  if (opts.offset) {
    query = query.range(opts.offset, opts.offset + (opts.limit ?? 20) - 1);
  } else if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<ContentRow>(data);
}

/** Get a single content item by id */
export async function getContentById(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ContentRow>(data);
}

/** Get a single content item by slug */
export async function getContentBySlug(
  siteId: string,
  slug: string,
  includePreview = false,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow | null> {
  const sb = includePreview ? await getClient() : getAnonClient();
  let query = sb.from(TABLE).select("*").eq("site_id", siteId).eq("slug", slug);

  if (!includePreview) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ContentRow>(data);
}

/**
 * A-007: Stale-while-revalidate cached variant for public content pages.
 * Falls back to the uncached `getContentBySlug` if skip-db is active.
 */
export const getContentBySlugPublic = unstable_cache(
  async (siteId: string, slug: string): Promise<ContentRow | null> => {
    if (shouldSkipDbCall()) return null;
    const sb = getAnonClient();
    const { data, error } = await sb
      .from(TABLE)
      .select("*")
      .eq("site_id", siteId)
      .eq("slug", slug)
      .eq("status", "published")
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return rowOrNull<ContentRow>(data);
  },
  ["content-by-slug"],
  { revalidate: 60, tags: ["content"] },
);

/** Create content */
export async function createContent(
  input: Omit<ContentRow, "id" | "created_at" | "updated_at">,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow> {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<ContentRow>(data, "Content");
}

/** Update content (saves previous body for version history) */
export async function updateContent(
  siteId: string,
  id: string,
  input: Partial<Omit<ContentRow, "id" | "site_id" | "created_at" | "updated_at">>,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow> {
  const sb = await getClient();

  // If body is being updated, save current body as body_previous for versioning
  if (typeof input.body === "string") {
    const { data: current } = await sb
      .from(TABLE)
      .select("body")
      .eq("site_id", siteId)
      .eq("id", id)
      .single();

    if (current && hasStringProp(current, "body")) {
      (input as Record<string, unknown>).body_previous = current.body;
    }
  }

  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<ContentRow>(data, "Content");
}

/** Delete content */
export async function deleteContent(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);

  if (error) throw error;
}

/** Count content items matching filters */
export async function countContent(
  opts: CountContentOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  const sb = await getClient();
  let query = sb.from(TABLE).select("*", { count: "exact", head: true }).eq("site_id", opts.siteId);

  if (opts.types && opts.types.length > 0) {
    query = query.in("type", opts.types);
  } else if (opts.contentType) {
    query = query.eq("type", opts.contentType);
  }
  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  } else if (opts.status) {
    query = query.eq("status", opts.status);
  }
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  if (opts.q && opts.q.trim().length > 0) {
    query = query.ilike("title", `%${escapeLike(opts.q.trim())}%`);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** List published content for public pages */
export async function listPublishedContent(
  siteId: string,
  contentType?: string,
  limit = 20,
  offset = 0,
): Promise<ContentRow[]> {
  // Skip DB calls when Supabase is not configured or during next build
  // (SUPABASE_SERVICE_ROLE_KEY is a Worker runtime secret, not available at build time).
  if (shouldSkipDbCall()) {
    return [];
  }
  const sb = getAnonClient();
  let query = sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (contentType) query = query.eq("type", contentType);
  if (offset > 0) query = query.range(offset, offset + limit - 1);
  else query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<ContentRow>(data);
}

/** Get recent published content (for homepage) */
export async function getRecentContent(siteId: string, limit = 6): Promise<ContentRow[]> {
  return listPublishedContent(siteId, undefined, limit);
}

/** Count published content for pagination */
export async function countPublishedContent(siteId: string, contentType?: string): Promise<number> {
  // Skip when Supabase is not configured or during next build.
  if (shouldSkipDbCall()) {
    return 0;
  }
  const sb = getAnonClient();
  let query = sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("site_id", siteId)
    .eq("status", "published");

  if (contentType) query = query.eq("type", contentType);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/**
 * Search published content using Postgres full-text search.
 * Falls back to ILIKE when the query cannot be converted to a valid tsquery
 * (e.g. only punctuation) or when the FTS column doesn't exist yet.
 */
export async function searchContent(
  siteId: string,
  query: string,
  limit = 20,
): Promise<ContentRow[]> {
  const sb = getAnonClient();
  const tsq = toTsquery(query);

  if (tsq) {
    const { data, error } = await sb
      .from(TABLE)
      .select(LIST_COLUMNS)
      .eq("site_id", siteId)
      .eq("status", "published")
      .or(`title.fts.${tsq},excerpt.fts.${tsq}`)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (!error) return assertRows<ContentRow>(data);
    // If FTS fails (e.g. column/index not ready), fall through to ILIKE.
  }

  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "published")
    .ilike("title", `%${escapeLike(query)}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return assertRows<ContentRow>(data);
}

/** Get related content by category (excluding a specific content id) */
export async function getRelatedContent(
  siteId: string,
  categoryId: string | null,
  excludeId: string,
  limit = 4,
): Promise<ContentRow[]> {
  const sb = getAnonClient();
  let query = sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "published")
    .neq("id", excludeId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<ContentRow>(data);
}
