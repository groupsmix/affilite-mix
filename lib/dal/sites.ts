import { getServiceClient } from "@/lib/supabase-server";
import type { SiteRow } from "@/types/database";

const TABLE = "sites";

/** List all sites */
export async function listSites(): Promise<SiteRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as SiteRow[];
}

/** Get a single site by id */
export async function getSiteRowById(
  id: string,
): Promise<SiteRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as unknown as SiteRow) ?? null;
}

/** Get a single site by slug */
export async function getSiteRowBySlug(
  slug: string,
): Promise<SiteRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as unknown as SiteRow) ?? null;
}

/** Create a new site */
export async function createSite(input: {
  slug: string;
  name: string;
  domain: string;
  language?: string;
  direction?: "ltr" | "rtl";
}): Promise<SiteRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      slug: input.slug,
      name: input.name,
      domain: input.domain,
      language: input.language ?? "en",
      direction: input.direction ?? "ltr",
    })
    .select()
    .single();

  if (error) throw error;
  return data as SiteRow;
}

/** Update a site */
export async function updateSite(
  id: string,
  input: Partial<Pick<SiteRow, "name" | "domain" | "language" | "direction">>,
): Promise<SiteRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as SiteRow;
}

/** Delete a site */
export async function deleteSite(id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}
