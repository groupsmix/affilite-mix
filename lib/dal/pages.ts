import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, rowOrNull, assertRow } from "./type-guards";
import type { PageRow } from "@/types/database";

function pagesTable() {
  return getServiceClient().from("pages");
}

/* ------------------------------------------------------------------ */
/*  Read operations                                                     */
/* ------------------------------------------------------------------ */

/** List all pages for a site (ordered by sort_order) */
export async function listPages(siteId: string): Promise<PageRow[]> {
  const { data, error } = await pagesTable()
    .select("*")
    .eq("site_id", siteId)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return assertRows<PageRow>(data);
}

/** List only published pages for a site */
export async function listPublishedPages(siteId: string): Promise<PageRow[]> {
  const { data, error } = await pagesTable()
    .select("*")
    .eq("site_id", siteId)
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return assertRows<PageRow>(data);
}

/** Get a single page by slug within a site */
export async function getPageBySlug(siteId: string, slug: string): Promise<PageRow | null> {
  const { data, error } = await pagesTable()
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<PageRow>(data);
}

/** Get a single page by id */
export async function getPageById(id: string): Promise<PageRow | null> {
  const { data, error } = await pagesTable().select("*").eq("id", id).single();

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
  const { data, error } = await pagesTable()
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

/** Update a page */
export async function updatePage(
  id: string,
  input: Partial<Pick<PageRow, "slug" | "title" | "body" | "is_published" | "sort_order">>,
): Promise<PageRow> {
  const { data, error } = await pagesTable().update(input).eq("id", id).select().single();

  if (error) throw error;
  return assertRow<PageRow>(data, "Page");
}

/** Delete a page */
export async function deletePage(id: string): Promise<void> {
  const { error } = await pagesTable().delete().eq("id", id);
  if (error) throw error;
}

/** Bulk update sort order atomically via a single database transaction */
export async function reorderPages(pages: { id: string; sort_order: number }[]): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.rpc("reorder_pages", {
    updates: pages as unknown as { id: string; sort_order: number }[],
  });
  if (error) throw error;
}
