import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

const TABLE = "niche_templates";

export interface NicheTemplateRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  default_theme: Record<string, unknown>;
  default_nav: { label: string; href: string; icon?: string }[];
  default_footer: { label: string; href: string; icon?: string }[];
  default_features: Record<string, boolean>;
  monetization_type: string;
  language: string;
  direction: string;
  custom_css: string;
  social_links: Record<string, string>;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

/** List all niche templates */
export async function listNicheTemplates(): Promise<NicheTemplateRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("is_builtin", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<NicheTemplateRow>(data ?? []);
}

/** Get a single template by slug */
export async function getNicheTemplateBySlug(slug: string): Promise<NicheTemplateRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).select("*").eq("slug", slug).single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<NicheTemplateRow>(data);
}

/** Create a new niche template */
export async function createNicheTemplate(
  input: Omit<NicheTemplateRow, "id" | "created_at" | "updated_at" | "is_builtin">,
): Promise<NicheTemplateRow> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();

  if (error) throw error;
  return assertRow<NicheTemplateRow>(data, "NicheTemplate");
}

/** Update an existing niche template */
export async function updateNicheTemplate(
  id: string,
  input: Partial<Omit<NicheTemplateRow, "id" | "created_at" | "updated_at" | "is_builtin">>,
): Promise<NicheTemplateRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<NicheTemplateRow>(data, "NicheTemplate");
}

/** Delete a niche template (only non-builtin) */
export async function deleteNicheTemplate(id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id).eq("is_builtin", false);

  if (error) throw error;
}
