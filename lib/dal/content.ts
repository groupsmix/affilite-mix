import { getServiceClient } from "@/lib/supabase-server";
import type { ContentRow } from "@/types/database";

const TABLE = "content";

export interface ListContentOptions {
  siteId: string;
  contentType?: string;
  status?: ContentRow["status"];
  categoryId?: string;
  limit?: number;
  offset?: number;
}

/** List content for a site with optional filters */
export async function listContent(
  opts: ListContentOptions,
): Promise<ContentRow[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", opts.siteId)
    .order("created_at", { ascending: false });

  if (opts.contentType) query = query.eq("type", opts.contentType);
  if (opts.status) query = query.eq("status", opts.status);
  if (opts.categoryId) query = query.eq("category_id", opts.categoryId);
  if (opts.limit) query = query.limit(opts.limit);
  if (opts.offset) query = query.range(opts.offset, opts.offset + (opts.limit ?? 20) - 1);

  const { data, error } = await query;
  if (error) throw error;
  return data as ContentRow[];
}

/** Get a single content item by id */
export async function getContentById(
  siteId: string,
  id: string,
): Promise<ContentRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as ContentRow) ?? null;
}

/** Get a single content item by slug */
export async function getContentBySlug(
  siteId: string,
  slug: string,
  includePreview = false,
): Promise<ContentRow | null> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug);

  if (!includePreview) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as ContentRow) ?? null;
}

/** Create content */
export async function createContent(
  input: Omit<ContentRow, "id" | "created_at" | "updated_at">,
): Promise<ContentRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();
  if (error) throw error;
  return data as ContentRow;
}

/** Update content */
export async function updateContent(
  siteId: string,
  id: string,
  input: Partial<
    Omit<ContentRow, "id" | "site_id" | "created_at" | "updated_at">
  >,
): Promise<ContentRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ContentRow;
}

/** Delete content */
export async function deleteContent(
  siteId: string,
  id: string,
): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("site_id", siteId)
    .eq("id", id);

  if (error) throw error;
}

/** List published content for public pages */
export async function listPublishedContent(
  siteId: string,
  contentType?: string,
  limit = 20,
  offset = 0,
): Promise<ContentRow[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (contentType) query = query.eq("type", contentType);
  if (offset > 0) query = query.range(offset, offset + limit - 1);
  else query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data as ContentRow[];
}

/** Get recent published content (for homepage) */
export async function getRecentContent(
  siteId: string,
  limit = 6,
): Promise<ContentRow[]> {
  return listPublishedContent(siteId, undefined, limit);
}

/** Count published content for pagination */
export async function countPublishedContent(
  siteId: string,
  contentType?: string,
): Promise<number> {
  const sb = getServiceClient();
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

/** Search published content by title (basic search) */
export async function searchContent(
  siteId: string,
  query: string,
  limit = 20,
): Promise<ContentRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("status", "published")
    .ilike("title", `%${query}%`)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as ContentRow[];
}

/** Get related content by category (excluding a specific content id) */
export async function getRelatedContent(
  siteId: string,
  categoryId: string | null,
  excludeId: string,
  limit = 4,
): Promise<ContentRow[]> {
  const sb = getServiceClient();
  let query = sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("status", "published")
    .neq("id", excludeId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (categoryId) query = query.eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) throw error;
  return data as ContentRow[];
}
