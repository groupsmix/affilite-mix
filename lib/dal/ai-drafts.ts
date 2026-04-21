import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

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

export interface ListAIDraftsOptions {
  siteId: string;
  status?: AIDraftRow["status"];
  contentType?: string;
  limit?: number;
  offset?: number;
}

/** List AI drafts for a site with optional filters */
export async function listAIDrafts(opts: ListAIDraftsOptions): Promise<AIDraftRow[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", opts.siteId)
    .order("created_at", { ascending: false });

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.contentType) query = query.eq("content_type", opts.contentType);
  if (opts.offset) {
    query = query.range(opts.offset, opts.offset + (opts.limit ?? 20) - 1);
  } else if (opts.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<AIDraftRow>(data);
}

/** Get a single AI draft by id */
export async function getAIDraftById(siteId: string, id: string): Promise<AIDraftRow | null> {
  const sb = getServiceClient();
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
): Promise<AIDraftRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert(input as never)
    .select()
    .single();
  if (error) throw error;
  return assertRow<AIDraftRow>(data, "AIDraft");
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
): Promise<AIDraftRow> {
  const sb = getServiceClient();
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

/** Delete an AI draft */
export async function deleteAIDraft(siteId: string, id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}

/** Count AI drafts by status */
export async function countAIDrafts(
  siteId: string,
  status?: AIDraftRow["status"],
): Promise<number> {
  const sb = getServiceClient();
  let query = sb.from(TABLE).select("*", { count: "exact", head: true }).eq("site_id", siteId);

  if (status) query = query.eq("status", status);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
