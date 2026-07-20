import type { AuthorRow, ContentRow } from "@/types/database";
import { shouldSkipDbCall } from "@/lib/db-available";
import { assertRows, rowOrNull } from "./type-guards";
import type { DalClientGetter } from "./dal-client";
import { defaultDalClientGetter } from "./dal-client";

const TABLE = "authors";

const AUTHOR_COLUMNS =
  "id, site_id, name, slug, bio, photo_url, credentials, expertise, social_links, is_active, created_at, updated_at" as const;

/** List active authors for a site */
export async function listAuthorsForSite(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AuthorRow[]> {
  if (shouldSkipDbCall()) return [];
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(AUTHOR_COLUMNS)
    .eq("site_id", siteId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<AuthorRow>(data);
}

/** Get a single author by slug */
export async function getAuthorBySlug(
  siteId: string,
  slug: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AuthorRow | null> {
  if (shouldSkipDbCall()) return null;
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(AUTHOR_COLUMNS)
    .eq("site_id", siteId)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AuthorRow>(data);
}

/** Get an author by id */
export async function getAuthorById(
  siteId: string,
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AuthorRow | null> {
  if (shouldSkipDbCall()) return null;
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(AUTHOR_COLUMNS)
    .eq("site_id", siteId)
    .eq("id", id)
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AuthorRow>(data);
}

const LIST_COLUMNS =
  "id, site_id, title, slug, excerpt, featured_image, type, status, review_state, category_id, tags, author, author_id, publish_at, meta_title, meta_description, og_image, created_at, updated_at" as const;

/** List published content by a given author */
export async function listPublishedContentByAuthor(
  siteId: string,
  authorId: string,
  limit = 50,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<ContentRow[]> {
  if (shouldSkipDbCall()) return [];
  const sb = await getClient();
  const { data, error } = await sb
    .from("content")
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .eq("author_id", authorId)
    .eq("status", "published")
    .order("publish_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return assertRows<ContentRow>(data);
}
