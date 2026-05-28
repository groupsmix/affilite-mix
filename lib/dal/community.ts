import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

// ── Wrist Shots ──────────────────────────────────────────────

export interface WristShotRow {
  id: string;
  site_id: string;
  product_id: string | null;
  user_email: string;
  user_name: string;
  image_url: string;
  caption: string | null;
  status: "pending" | "approved" | "rejected";
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

const WRIST_SHOTS_TABLE = "wrist_shots";
const WRIST_SHOT_COLUMNS =
  "id, site_id, product_id, user_email, user_name, image_url, caption, status, approved_at, created_at, updated_at" as const;

/** Submit a wrist shot (goes to moderation queue) */
export async function createWristShot(
  input: {
    site_id: string;
    product_id?: string;
    user_email: string;
    user_name: string;
    image_url: string;
    caption?: string;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<WristShotRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(WRIST_SHOTS_TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<WristShotRow>(data, "WristShot");
}

/**
 * List approved wrist shots for a product.
 *
 * audit5-#5: `siteId` is required and passed explicitly to the query as a
 * defense-in-depth filter on top of the `tenant_isolation_auth_<table>`
 * RLS policy (supabase/migrations/00067). RLS already scopes the read to
 * the JWT's `site_id` claim, so cross-tenant data does not leak today;
 * however, if a future refactor swaps the default client for a
 * privileged (service-role) client the RLS filter disappears and only
 * this explicit `.eq("site_id", siteId)` keeps tenants isolated. Belt
 * AND braces.
 */
export async function listApprovedWristShots(
  siteId: string,
  productId: string,
  limit: number = 20,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<WristShotRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(WRIST_SHOTS_TABLE)
    .select(WRIST_SHOT_COLUMNS)
    .eq("site_id", siteId)
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return assertRows<WristShotRow>(data);
}

/** List pending wrist shots for moderation */
async function listPendingWristShots(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<WristShotRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(WRIST_SHOTS_TABLE)
    .select(WRIST_SHOT_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<WristShotRow>(data);
}

/** Moderate a wrist shot */
async function moderateWristShot(
  id: string,
  status: "approved" | "rejected",
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<WristShotRow> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(WRIST_SHOTS_TABLE)
    .update({
      status,
      ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<WristShotRow>(data, "WristShot");
}

// ── Comments ──────────────────────────────────────────────

export interface CommentRow {
  id: string;
  site_id: string;
  target_type: "product" | "content";
  target_id: string;
  parent_id: string | null;
  user_email: string;
  user_name: string;
  body: string;
  status: "pending" | "approved" | "rejected" | "spam";
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

const COMMENTS_TABLE = "comments";
const COMMENT_COLUMNS =
  "id, site_id, target_type, target_id, parent_id, user_email, user_name, body, status, approved_at, created_at, updated_at" as const;

/** Post a comment (goes to moderation queue) */
export async function createComment(
  input: {
    site_id: string;
    target_type: "product" | "content";
    target_id: string;
    parent_id?: string;
    user_email: string;
    user_name: string;
    body: string;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<CommentRow> {
  const sb = await getClient();

  const { data, error } = await sb.from(COMMENTS_TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<CommentRow>(data, "Comment");
}

/**
 * List approved comments for a target (product or content), threaded.
 *
 * audit5-#5: `siteId` is required and passed explicitly. See the
 * matching comment on `listApprovedWristShots` above — the explicit
 * `.eq("site_id", siteId)` is a defense-in-depth filter that survives
 * a future swap to a privileged client which would bypass RLS.
 */
export async function listApprovedComments(
  siteId: string,
  targetType: "product" | "content",
  targetId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<CommentRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(COMMENTS_TABLE)
    .select(COMMENT_COLUMNS)
    .eq("site_id", siteId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<CommentRow>(data);
}

/** List pending comments for moderation */
async function listPendingComments(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<CommentRow[]> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(COMMENTS_TABLE)
    .select(COMMENT_COLUMNS)
    .eq("site_id", siteId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<CommentRow>(data);
}

/** Moderate a comment */
async function moderateComment(
  id: string,
  status: "approved" | "rejected" | "spam",
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<CommentRow> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(COMMENTS_TABLE)
    .update({
      status,
      ...(status === "approved" ? { approved_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<CommentRow>(data, "Comment");
}

/** Get comment by ID */
async function getCommentById(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<CommentRow | null> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(COMMENTS_TABLE)
    .select(COMMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return rowOrNull<CommentRow>(data);
}
