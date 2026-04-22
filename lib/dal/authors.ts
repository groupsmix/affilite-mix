import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

export interface AuthorRow {
  id: string;
  site_id: string;
  name: string;
  slug: string;
  bio: string;
  photo_url: string;
  credentials: string;
  expertise: string[];
  social_links: Record<string, string>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "authors";

/** List authors for a site */
export async function listAuthors(siteId: string): Promise<AuthorRow[]> {
  const sb = getServiceClient();

  const { data, error } = await (sb.from as any)(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<AuthorRow>(data);
}

/** Get an author by ID (scoped to site) */
export async function getAuthorById(siteId: string, id: string): Promise<AuthorRow | null> {
  const sb = getServiceClient();

  const { data, error } = await (sb.from as any)(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AuthorRow>(data);
}

/** Get an author by slug within a site */
export async function getAuthorBySlug(siteId: string, slug: string): Promise<AuthorRow | null> {
  const sb = getServiceClient();

  const { data, error } = await (sb.from as any)(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AuthorRow>(data);
}

/** Create an author */
export async function createAuthor(input: {
  site_id: string;
  name: string;
  slug: string;
  bio?: string;
  photo_url?: string;
  credentials?: string;
  expertise?: string[];
  social_links?: Record<string, string>;
}): Promise<AuthorRow> {
  const sb = getServiceClient();

  const { data, error } = await (sb.from as any)(TABLE).insert(input).select().single();

  if (error) throw error;
  return assertRow<AuthorRow>(data, "Author");
}

/** Update an author (scoped to site) */
export async function updateAuthor(
  siteId: string,
  id: string,
  input: Partial<
    Pick<
      AuthorRow,
      | "name"
      | "slug"
      | "bio"
      | "photo_url"
      | "credentials"
      | "expertise"
      | "social_links"
      | "is_active"
    >
  >,
): Promise<AuthorRow> {
  const sb = getServiceClient();

  const { data, error } = await (sb.from as any)(TABLE)
    .update(input)
    .eq("site_id", siteId)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<AuthorRow>(data, "Author");
}

/** Delete an author (scoped to site) */
export async function deleteAuthor(siteId: string, id: string): Promise<void> {
  const sb = getServiceClient();

  const { error } = await (sb.from as any)(TABLE).delete().eq("site_id", siteId).eq("id", id);
  if (error) throw error;
}
