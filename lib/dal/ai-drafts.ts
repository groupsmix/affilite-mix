import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { clampPagination } from "./pagination-guard";
import { escapeLike } from "./search-utils";

export interface AIDraftRow {
  id: string;
  site_id: string;
  title: string;
  slug: string;
  body: string;
  excerpt: string;
  content_type: string;
  topic: string;
  keywords: string[];
  ai_provider: string;
  /** Model identifier used for generation (e.g. "gemini-1.5-flash") */
  ai_model: string;
  status: "pending" | "approved" | "rejected" | "published";
  generated_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  meta_title: string | null;
  meta_description: string | null;
  created_at: string;
  updated_at: string;
}

const TABLE = "ai_drafts";
// A23-01: Explicit column list — prevents silent exposure of new columns.
const DRAFT_COLUMNS =
  "id, site_id, title, slug, body, excerpt, content_type, topic, keywords, ai_provider, ai_model, status, generated_at, reviewed_at, reviewed_by, meta_title, meta_description, created_at, updated_at" as const;

export interface ListAIDraftsOptions {
  siteId: string;
  status?: AIDraftRow["status"];
  contentType?: string;
  /** Free-text search against `title` (ILIKE). */
  q?: string;
  limit?: number;
  /** @deprecated Use `cursor` for O(1) keyset pagination. */
  offset?: number;
  /** A73-01: Keyset cursor — ISO-8601 `created_at` of the last item from
   *  the previous page. Queries with a cursor skip the O(n) offset scan. */
  cursor?: string;
}

/** List AI drafts for a site with optional filters */
export async function listAIDrafts(
  opts: ListAIDraftsOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AIDraftRow[]> {
  const sb = await getClient();
  let query = sb
    .from(TABLE)
    .select(DRAFT_COLUMNS)
    .eq("site_id", opts.siteId)
    .order("created_at", { ascending: false });

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.contentType) query = query.eq("content_type", opts.contentType);
  if (opts.q && opts.q.trim().length > 0) {
    query = query.ilike("title", `%${escapeLike(opts.q.trim())}%`);
  }

  // A73-01: Prefer keyset cursor over offset for O(1) pagination.
  // S4-A98.2: Clamp pagination to prevent integer overflow at extreme offsets.
  const { limit: safeLimit, offset: safeOffset } = clampPagination(opts);
  if (opts.cursor) {
    query = query.lt("created_at", opts.cursor);
    query = query.limit(safeLimit);
  } else if (safeOffset > 0) {
    query = query.range(safeOffset, safeOffset + safeLimit - 1);
  } else {
    query = query.limit(safeLimit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<AIDraftRow>(data);
}

export interface CountAIDraftsOptions {
  siteId: string;
  status?: AIDraftRow["status"];
  contentType?: string;
  q?: string;
}

/** Count AI drafts matching filters */
export async function countAIDrafts(
  opts: CountAIDraftsOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  const sb = await getClient();
  let query = sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("site_id", opts.siteId);

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.contentType) query = query.eq("content_type", opts.contentType);
  if (opts.q && opts.q.trim().length > 0) {
    query = query.ilike("title", `%${escapeLike(opts.q.trim())}%`);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

/** Fetch a single AI draft by id (tenant-isolated) */
export async function getAIDraft(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AIDraftRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(DRAFT_COLUMNS)
    .eq("site_id", siteId)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<AIDraftRow>(data);
}

/** Create a new AI draft */
export async function createAIDraft(
  input: Omit<AIDraftRow, "id" | "created_at" | "updated_at" | "reviewed_at" | "reviewed_by">,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AIDraftRow> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert(input as never)
    .select()
    .single();
  if (error) throw error;
  return assertRow<AIDraftRow>(data, "AIDraft");
}

/** Update an AI draft (e.g. approve/reject).
 *  AUDIT-FIX A3-003: Returns null when no row matches (cross-tenant IDOR probe). */
export async function updateAIDraft(
  siteId: string,
  id: string,
  input: Partial<
    Pick<
      AIDraftRow,
      | "status"
      | "title"
      | "slug"
      | "body"
      | "excerpt"
      | "reviewed_at"
      | "reviewed_by"
      | "meta_title"
      | "meta_description"
    >
  >,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AIDraftRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input as never)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<AIDraftRow>(data);
}

/** Delete an AI draft */
export async function deleteAIDraft(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}
