import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

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

/** Submit a wrist shot (goes to moderation queue) */
export async function createWristShot(input: {
  site_id: string;
  product_id?: string;
  user_email: string;
  user_name: string;
  image_url: string;
  caption?: string;
}): Promise<WristShotRow> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(WRIST_SHOTS_TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<WristShotRow>(data, "WristShot");
}

/** List approved wrist shots for a product */
export async function listApprovedWristShots(
  productId: string,
  limit: number = 20,
): Promise<WristShotRow[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(WRIST_SHOTS_TABLE)
    .select("*")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return assertRows<WristShotRow>(data);
}

/** List pending wrist shots for moderation */
export async function listPendingWristShots(siteId: string): Promise<WristShotRow[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(WRIST_SHOTS_TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<WristShotRow>(data);
}

/** Moderate a wrist shot */
export async function moderateWristShot(
  id: string,
  status: "approved" | "rejected",
): Promise<WristShotRow> {
  const sb = getServiceClient();

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

/** Post a comment (goes to moderation queue) */
export async function createComment(input: {
  site_id: string;
  target_type: "product" | "content";
  target_id: string;
  parent_id?: string;
  user_email: string;
  user_name: string;
  body: string;
}): Promise<CommentRow> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(COMMENTS_TABLE).insert(input).select().single();
  if (error) throw error;
  return assertRow<CommentRow>(data, "Comment");
}

/** List approved comments for a target (product or content), threaded */
export async function listApprovedComments(
  targetType: "product" | "content",
  targetId: string,
): Promise<CommentRow[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(COMMENTS_TABLE)
    .select("*")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<CommentRow>(data);
}

/** List pending comments for moderation */
export async function listPendingComments(siteId: string): Promise<CommentRow[]> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(COMMENTS_TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<CommentRow>(data);
}

/** Moderate a comment */
export async function moderateComment(
  id: string,
  status: "approved" | "rejected" | "spam",
): Promise<CommentRow> {
  const sb = getServiceClient();

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
export async function getCommentById(id: string): Promise<CommentRow | null> {
  const sb = getServiceClient();

  const { data, error } = await sb.from(COMMENTS_TABLE).select("*").eq("id", id).maybeSingle();

  if (error) throw error;
  return rowOrNull<CommentRow>(data);
}
