import { getTenantClient } from "@/lib/supabase-server";
import type { ContentRow } from "@/types/database";
import { escapeLike, toTsquery } from "./search-utils";
import { assertRows, assertRow, rowOrNull, hasStringProp } from "./type-guards";
import { shouldSkipDbCall } from "@/lib/db-available";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { clampPagination } from "./pagination-guard";

const TABLE = "content";

export type ContentSortColumn =
  | "title"
  | "publish_at"
  | "status"
  | "author"
  | "created_at"
  | "updated_at";

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
  /** Filter by structured author_id (takes precedence over legacy text `author`). */
  authorId?: string;
  /** Free-text search against `title` (ILIKE). */
  q?: string;
  /** Sort column; defaults to `created_at` descending for backward-compat. */
  sortBy?: ContentSortColumn;
  sortDirection?: "asc" | "desc";
  limit?: number;
  /** @deprecated Use `cursor` for O(1) keyset pagination. */
  offset?: number;
  /** A73-01: Keyset cursor — value of the sort column from the last item
   *  of the previous page. Avoids O(n) offset scan at high page numbers. */
  cursor?: string;
}

export type CountContentOptions = Omit<
  ListContentOptions,
  "limit" | "offset" | "sortBy" | "sortDirection" | "cursor"
>;

// Columns needed for list views (excludes heavy body/body_previous)
const LIST_COLUMNS =
  "id, site_id, title, slug, excerpt, featured_image, type, status, review_state, category_id, tags, author, author_id, publish_at, meta_title, meta_description, og_image, created_at, updated_at" as const;

// A23-01: Full explicit column list for detail views (includes body).
const DETAIL_COLUMNS =
  "id, site_id, title, slug, body, excerpt, featured_image, type, status, review_state, category_id, tags, author, author_id, publish_at, meta_title, meta_description, og_image, body_previous, ai_generated, created_at, updated_at" as const;

/** List content for a site with optional filters */
export async function listContent(
  opts: ListContentOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow[]> {
  const sb = await getClient();
  const sortColumn: ContentSortColumn = opts.sortBy ?? "created_at";
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
  if (opts.authorId) query = query.eq("author_id", opts.authorId);
  if (opts.q && opts.q.trim().length > 0) {
    query = query.ilike("title", `%${escapeLike(opts.q.trim())}%`);
  }
  // A73-01: Prefer keyset cursor over offset for O(1) pagination.
  // S4-A98.2: Clamp pagination to prevent integer overflow at extreme offsets.
  const { limit: safeLimit, offset: safeOffset } = clampPagination(opts);
  if (opts.cursor) {
    const op = ascending ? "gt" : "lt";
    query = query[op](sortColumn, opts.cursor);
    query = query.limit(safeLimit);
  } else if (safeOffset > 0) {
    query = query.range(safeOffset, safeOffset + safeLimit - 1);
  } else {
    query = query.limit(safeLimit);
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
    .select(DETAIL_COLUMNS)
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
  const sb = includePreview ? await getClient() : await getTenantClient();
  let query = sb.from(TABLE).select(DETAIL_COLUMNS).eq("site_id", siteId).eq("slug", slug);

  if (!includePreview) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<ContentRow>(data);
}

interface ContentTitleRow {
  id: string;
  slug: string;
  title: string;
}

/** Resolve real titles for a set of content slugs. */
export async function getContentTitlesBySlugs(
  siteId: string,
  slugs: string[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Record<string, ContentTitleRow>> {
  if (slugs.length === 0) return {};
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, slug, title")
    .eq("site_id", siteId)
    .in("slug", [...new Set(slugs)]);

  if (error) throw error;
  const rows = assertRows<ContentTitleRow>(data);
  return Object.fromEntries(rows.map((row) => [row.slug, row]));
}

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

/** Update content (saves previous body for version history).
 *  S1-A18-001: Accepts optional `expectedUpdatedAt` for optimistic locking.
 *  When provided, the update is conditioned on the row's `updated_at` matching
 *  the value the client last read — preventing lost-update races (CWE-362). */
export async function updateContent(
  siteId: string,
  id: string,
  input: Partial<Omit<ContentRow, "id" | "site_id" | "created_at" | "updated_at">>,
  getClient: DalClientGetter = defaultDalClientGetter,
  expectedUpdatedAt?: string,
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

  let query = sb.from(TABLE).update(input).eq("site_id", siteId).eq("id", id);

  // S1-A18-001: Optimistic locking — only update if row hasn't been
  // modified since the client last read it.
  if (expectedUpdatedAt) {
    query = query.eq("updated_at", expectedUpdatedAt);
  }

  const { data, error } = await query.select().single();

  if (error) {
    // PGRST116 = no rows matched — likely an optimistic lock conflict
    if (error.code === "PGRST116" && expectedUpdatedAt) {
      const conflictErr = new Error(
        "Content was modified by another user. Please refresh and try again.",
      );
      (conflictErr as Error & { status?: number }).status = 409;
      throw conflictErr;
    }
    throw error;
  }
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
  let query = sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("site_id", opts.siteId);

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
  if (opts.authorId) query = query.eq("author_id", opts.authorId);
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
  // S4-A98.2: Clamp pagination parameters.
  const { limit: safeLimit, offset: safeOffset } = clampPagination({ limit, offset });
  const sb = await getTenantClient();
  let query = sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (contentType) query = query.eq("type", contentType);
  if (safeOffset > 0) query = query.range(safeOffset, safeOffset + safeLimit - 1);
  else query = query.limit(safeLimit);

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
  const sb = await getTenantClient();
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
  const sb = await getTenantClient();
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
  const sb = await getTenantClient();
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
