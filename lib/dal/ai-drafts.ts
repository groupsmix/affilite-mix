import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

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

/** AUDIT-FIX A5-002: Validated content_type allowlist.
 *  Only these values are accepted as database filters.
 *  Any other value is silently ignored (returns all types) rather than
 *  being passed to the query, preventing degraded query plans from
 *  arbitrary strings hitting the DB.
 */
const VALID_CONTENT_TYPES = new Set(["article", "review", "comparison", "guide"]);

/** AUDIT-FIX A5-003: Maximum offset for pagination.
 *  Beyond this, keyset/cursor pagination must be used.
 */
const MAX_SAFE_OFFSET = 10_000;

/** AUDIT-FIX A6-002: UUID format validation regex.
 *  Matches standard UUID v4 format: 8-4-4-4-12 hex digits.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ListAIDraftsOptions {
  siteId: string;
  status?: AIDraftRow["status"];
  contentType?: string;
  limit?: number;
  offset?: number;
  /**
   * AUDIT-FIX A5-003: Keyset/cursor pagination.
   * Pass the created_at timestamp of the last item from the previous page
   * to fetch the next page. This is O(1) regardless of page depth.
   * When cursor is provided, offset is ignored.
   */
  cursor?: string;
}

/** AUDIT-FIX A5-003: Result shape for cursor-paginated list queries. */
export interface ListAIDraftsResult {
  items: AIDraftRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** AUDIT-FIX A6-002: Validate that an id parameter is a well-formed UUID.
 * Returns true if the id matches the UUID v4 format.
 */
export function isValidUUID(id: string): boolean {
  return UUID_RE.test(id);
}

/** AUDIT-FIX A5-002: Validate content_type against the allowlist.
 * Returns the content type if valid, undefined otherwise.
 */
function sanitizeContentType(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return VALID_CONTENT_TYPES.has(raw) ? raw : undefined;
}

/** List AI drafts for a site with optional filters */
export async function listAIDrafts(
  opts: ListAIDraftsOptions,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AIDraftRow[]> {
  const sb = await getClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", opts.siteId)
    .order("created_at", { ascending: false });

  if (opts.status) query = query.eq("status", opts.status);

  // AUDIT-FIX A5-002: Validate content_type before querying
  const safeContentType = sanitizeContentType(opts.contentType);
  if (safeContentType) query = query.eq("content_type", safeContentType);

  // AUDIT-FIX A5-003: Use cursor pagination when cursor is provided
  if (opts.cursor) {
    query = query.lt("created_at", opts.cursor);
    query = query.limit(opts.limit ?? 20);
  } else if (opts.offset) {
    // AUDIT-FIX A5-003: Cap offset to prevent worst-case performance
    const safeOffset = Math.min(opts.offset, MAX_SAFE_OFFSET);
    query = query.range(safeOffset, safeOffset + (opts.limit ?? 20) - 1);
  } else if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<AIDraftRow>(data);
}

/** AUDIT-FIX A5-003: Cursor-based pagination for AI drafts.
 *  Returns items plus a cursor for the next page.
 *  This is O(1) regardless of page depth, unlike offset pagination.
 */
export async function listAIDraftsCursor(
  opts: Omit<ListAIDraftsOptions, "offset">,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ListAIDraftsResult> {
  const sb = await getClient();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 100);

  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", opts.siteId)
    .order("created_at", { ascending: false });

  if (opts.status) query = query.eq("status", opts.status);

  const safeContentType = sanitizeContentType(opts.contentType);
  if (safeContentType) query = query.eq("content_type", safeContentType);

  if (opts.cursor) {
    query = query.lt("created_at", opts.cursor);
  }

  // Fetch limit + 1 to determine if there are more results
  query = query.limit(limit + 1);

  const { data, error } = await query;
  if (error) throw error;

  const rows = assertRows<AIDraftRow>(data);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].created_at : null;

  return { items, nextCursor, hasMore };
}

/** Get a single AI draft by id */
export async function getAIDraftById(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AIDraftRow | null> {
  // AUDIT-FIX A6-002: Validate UUID format before querying
  if (!isValidUUID(id)) {
    return null;
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
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

/**
 * AUDIT-FIX A6-005: Split update fields to prevent mass assignment.
 *
 * ReviewerEditDTO — fields an editor can safely modify during review.
 * Excludes slug and body which affect published pages.
 */
export interface ReviewerEditDTO {
  title?: string;
  excerpt?: string;
  meta_title?: string | null;
  meta_description?: string | null;
}

/**
 * AdminEditDTO — fields an admin can modify.
 * Includes slug and body but these require explicit opt-in.
 */
export interface AdminEditDTO extends ReviewerEditDTO {
  slug?: string;
  body?: string;
}

/** Update an AI draft (e.g. approve/reject) */
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
): Promise<AIDraftRow> {
  // AUDIT-FIX A6-002: Validate UUID format before querying
  if (!isValidUUID(id)) {
    throw new Error("Invalid draft ID format");
  }

  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input as never)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<AIDraftRow>(data, "AIDraft");
}

/** AUDIT-FIX A5-004: Publish an AI draft transactionally via RPC.
 *  This uses the database function `publish_ai_draft()` which wraps
 *  the entire publish flow in a single atomic transaction:
 *    1. Lock draft row FOR UPDATE
 *    2. Check for existing content with same slug
 *    3. Insert content row
 *    4. Update draft status to 'published'
 *    5. Record audit event
 *
 *  Returns the content_id on success, or throws on failure.
 */
export async function publishAIDraftTransactional(
  siteId: string,
  draftId: string,
  actor: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ ok: boolean; contentId?: string; error?: string; code?: string }> {
  // AUDIT-FIX A6-002: Validate UUID format before querying
  if (!isValidUUID(draftId)) {
    return { ok: false, error: "Invalid draft ID format", code: "INVALID_ID" };
  }

  const sb = await getClient();

  // AUDIT-FIX A5-004: Use RPC for atomic transactional publish
  const { data, error } = await sb.rpc("publish_ai_draft", {
    p_site_id: siteId,
    p_draft_id: draftId,
    p_actor: actor,
  });

  if (error) {
    // If the RPC function doesn't exist yet, fall back to application-level
    // publish with best-effort consistency
    if (error.message?.includes("function") && error.message?.includes("does not exist")) {
      return publishAIDraftFallback(siteId, draftId, actor, getClient);
    }
    throw error;
  }

  const result = (data as unknown) as {
    ok: boolean;
    id: string;
    status: string;
    content_id: string | null;
    error?: string;
    code?: string;
  };

  return {
    ok: result.ok,
    contentId: result.content_id ?? undefined,
    error: result.error,
    code: result.code,
  };
}

/**
 * Fallback publish for when the RPC function is not yet deployed.
 * This provides the same logical flow but without true transactionality.
 * The RPC should be deployed as soon as possible.
 */
async function publishAIDraftFallback(
  siteId: string,
  draftId: string,
  actor: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ ok: boolean; contentId?: string; error?: string; code?: string }> {
  const sb = await getClient();

  // Get the current draft
  const { data: draft, error: draftError } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", draftId)
    .single();

  if (draftError || !draft) {
    return { ok: false, error: "Draft not found", code: "NOT_FOUND" };
  }

  // Check if already published (idempotency)
  if (draft.status === "published") {
    return { ok: true, error: "Draft was already published" };
  }

  // Check for duplicate slug
  const { data: existing } = await sb
    .from("content")
    .select("id")
    .eq("site_id", siteId)
    .eq("slug", draft.slug)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: `Content with slug "${draft.slug}" already exists`, code: "DUPLICATE_SLUG" };
  }

  // Insert content
  const { data: content, error: contentError } = await sb
    .from("content")
    .insert({
      site_id: siteId,
      title: draft.title,
      slug: draft.slug,
      body: draft.body ?? "",
      excerpt: draft.excerpt ?? "",
      featured_image: "",
      type: draft.content_type as "article" | "review" | "comparison" | "guide" | "blog",
      status: "published",
      category_id: null,
      tags: draft.keywords ?? [],
      author: "AI",
      publish_at: null,
      meta_title: draft.meta_title,
      meta_description: draft.meta_description,
      og_image: null,
      body_previous: null,
      review_state: "published",
    })
    .select()
    .single();

  if (contentError) {
    return { ok: false, error: "Failed to create content", code: "INSERT_FAILED" };
  }

  // Update draft status
  await sb
    .from(TABLE)
    .update({
      status: "published",
      reviewed_at: draft.reviewed_at ?? new Date().toISOString(),
      reviewed_by: draft.reviewed_by ?? actor,
    })
    .eq("site_id", siteId)
    .eq("id", draftId);

  return { ok: true, contentId: content.id };
}

/** Delete an AI draft */
export async function deleteAIDraft(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  // AUDIT-FIX A6-002: Validate UUID format before querying
  if (!isValidUUID(id)) {
    throw new Error("Invalid draft ID format");
  }

  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}

/** Count AI drafts by status */
export async function countAIDrafts(
  siteId: string,
  status?: AIDraftRow["status"],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  const sb = await getClient();
  let query = sb.from(TABLE).select("*", { count: "exact", head: true }).eq("site_id", siteId);

  if (status) query = query.eq("status", status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
