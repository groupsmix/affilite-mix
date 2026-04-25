import { getTenantClient, getAnonClient } from "@/lib/supabase-server";
import { isSupabaseConfigured } from "@/lib/db-available";
import { assertRows, rowOrNull, assertRow } from "./type-guards";
import type { PageRow } from "@/types/database";

async function pagesTable() {
  const client = await getTenantClient();
  return client.from("pages");
}

// Columns needed for list views (excludes heavy body text)
const LIST_COLUMNS =
  "id, site_id, slug, title, is_published, sort_order, created_at, updated_at" as const;

/* ------------------------------------------------------------------ */
/*  Read operations                                                     */
/* ------------------------------------------------------------------ */

/** List all pages for a site (ordered by sort_order) */
export async function listPages(siteId: string): Promise<PageRow[]> {
  if (!isSupabaseConfigured()) return [];
  const table = await pagesTable();
  const { data, error } = await table
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return assertRows<PageRow>(data);
}

/** List only published pages for a site */
export async function listPublishedPages(siteId: string): Promise<PageRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await getAnonClient()
    .from("pages")
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return assertRows<PageRow>(data);
}

/** Get a single page by slug within a site */
export async function getPageBySlug(siteId: string, slug: string): Promise<PageRow | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await getAnonClient()
    .from("pages")
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<PageRow>(data);
}

/** Get a single page by id (scoped to site) */
export async function getPageById(siteId: string, id: string): Promise<PageRow | null> {
  if (!isSupabaseConfigured()) return null;
  const table = await pagesTable();
  const { data, error } = await table
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<PageRow>(data);
}

/* ------------------------------------------------------------------ */
/*  Write operations                                                    */
/* ------------------------------------------------------------------ */

/** Create a new page */
export async function createPage(input: {
  site_id: string;
  slug: string;
  title: string;
  body: string;
  is_published?: boolean;
  sort_order?: number;
}): Promise<PageRow> {
  const table = await pagesTable();
  const { data, error } = await table
    .insert({
      site_id: input.site_id,
      slug: input.slug,
      title: input.title,
      body: input.body,
      is_published: input.is_published ?? false,
      sort_order: input.sort_order ?? 0,
    })
    .select()
    .single();

  if (error) throw error;
  return assertRow<PageRow>(data, "Page");
}

/** Update a page (scoped to site) */
export async function updatePage(
  siteId: string,
  id: string,
  input: Partial<Pick<PageRow, "slug" | "title" | "body" | "is_published" | "sort_order">>,
): Promise<PageRow> {
  const table = await pagesTable();
  const { data, error } = await table
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<PageRow>(data, "Page");
}

/** Delete a page (scoped to site) */
export async function deletePage(siteId: string, id: string): Promise<void> {
  const table = await pagesTable();
  const { error } = await table.delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}

/** Bulk update sort order atomically via a single database transaction (scoped to site) */
export async function reorderPages(
  siteId: string,
  pages: { id: string; sort_order: number }[],
): Promise<void> {
  const sb = await getTenantClient();

  // Verify all page IDs belong to this site before reordering
  if (pages.length > 0) {
    const ids = pages.map((p) => p.id);
    const { data: ownedPages, error: checkError } = await sb
      .from("pages")
      .select("id")
      .eq("site_id", siteId)
      .in("id", ids);
    if (checkError) throw checkError;
    const ownedIds = new Set((ownedPages ?? []).map((p: { id: string }) => p.id));
    const foreign = ids.filter((id) => !ownedIds.has(id));
    if (foreign.length > 0) {
      throw new Error("One or more pages do not belong to this site");
    }
  }

  const { error } = await sb.rpc("reorder_pages", {
    p_site_id: siteId,
    updates: pages as unknown as { id: string; sort_order: number }[],
  });
  if (error) throw error;
}
