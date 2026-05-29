// DESIGN: No site_id filtering — niche templates are global resources shared across all tenants.
import { assertRows, assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "niche_templates";
const LIST_COLUMNS =
  "id, name, slug, description, monetization_type, language, direction, is_builtin, created_at, updated_at" as const;
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
  social_links: Record<string, string>;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

/** List all niche templates */
export async function listNicheTemplates(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<NicheTemplateRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .order("is_builtin", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<NicheTemplateRow>(data ?? []);
}

/** Create a new niche template */
export async function createNicheTemplate(
  input: Omit<NicheTemplateRow, "id" | "created_at" | "updated_at" | "is_builtin">,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<NicheTemplateRow> {
  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).insert(input).select().single();

  if (error) throw error;
  return assertRow<NicheTemplateRow>(data, "NicheTemplate");
}

/** Delete a niche template (only non-builtin) */
export async function deleteNicheTemplate(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id).eq("is_builtin", false);

  if (error) throw error;
}
