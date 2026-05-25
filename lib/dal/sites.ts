import { unstable_cache } from "next/cache";
import { getTenantClient } from "@/lib/supabase-server";
import { shouldSkipDbCall } from "@/lib/db-available";
import type { SiteRow } from "@/types/database";
import type { Database } from "@/types/supabase";
import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

type SiteInsert = Database["public"]["Tables"]["sites"]["Insert"];
type SiteUpdate = Database["public"]["Tables"]["sites"]["Update"];

const TABLE = "sites";
// Columns needed for list views (excludes heavy JSON blobs like ad_config, custom_css)
const LIST_COLUMNS =
  "id, slug, name, domain, language, direction, is_active, monetization_type, logo_url, favicon_url, meta_title, meta_description, og_image_url, created_at, updated_at" as const;
// A23-01: Explicit full-row column list — prevents future sensitive columns from
// leaking automatically when callers receive a complete SiteRow.
const ALL_COLUMNS =
  "id, slug, name, domain, language, direction, is_active, monetization_type, est_revenue_per_click, ad_config, theme, logo_url, favicon_url, nav_items, footer_nav, features, meta_title, meta_description, og_image_url, social_links, created_at, updated_at" as const;

/* ------------------------------------------------------------------ */
/*  Read operations (with unstable_cache)                              */
/* ------------------------------------------------------------------ */

/** List all sites (cached) */
export const listSites = unstable_cache(
  async (): Promise<SiteRow[]> => {
    if (shouldSkipDbCall()) return [];

    const sb = await getTenantClient();
    const { data, error } = await sb
      .from(TABLE)
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return assertRows<SiteRow>(data);
  },
  ["all-sites"],
  { revalidate: 60, tags: ["sites"] },
);

/** List all active sites (cached, filtered) */
export async function getAllActiveSites(): Promise<SiteRow[]> {
  const all = await listSites();
  return all.filter((s) => s.is_active);
}

/** Get a single site by its database UUID */
export async function getSiteRowById(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteRow | null> {
  if (shouldSkipDbCall()) return null;

  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).select(ALL_COLUMNS).eq("id", id).single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SiteRow>(data);
}

/** Get a single site by slug (uncached, accepts explicit client) */
export async function getSiteRowBySlugWithClient(
  slug: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteRow | null> {
  if (shouldSkipDbCall()) return null;

  const sb = await getClient();
  const { data, error } = await sb.from(TABLE).select(ALL_COLUMNS).eq("slug", slug).single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SiteRow>(data);
}

/** Get a single site by slug (cached) */
export const getSiteRowBySlug = unstable_cache(
  async (slug: string): Promise<SiteRow | null> => {
    return getSiteRowBySlugWithClient(slug, getTenantClient);
  },
  ["site-by-slug"],
  { revalidate: 60, tags: ["sites"] },
);

/** Get a single site by domain (cached) */
export const getSiteRowByDomain = unstable_cache(
  async (domain: string): Promise<SiteRow | null> => {
    if (shouldSkipDbCall()) return null;

    const sb = await getTenantClient();
    const { data, error } = await sb.from(TABLE).select(ALL_COLUMNS).eq("domain", domain).single();

    if (error && error.code !== "PGRST116") throw error;
    return rowOrNull<SiteRow>(data);
  },
  ["site-by-domain"],
  { revalidate: 60, tags: ["sites"] },
);

/* ------------------------------------------------------------------ */
/*  Write operations                                                  */
/* ------------------------------------------------------------------ */
import { revalidateTag } from "next/cache";

export function invalidateSiteCache(): void {
  revalidateTag("sites");
}

/** Create a new site */
export async function createSite(
  input: {
    slug: string;
    name: string;
    domain: string;
    language?: string;
    direction?: "ltr" | "rtl";
    is_active?: boolean;
    monetization_type?: "affiliate" | "ads" | "both";
    est_revenue_per_click?: number;
    ad_config?: Record<string, unknown>;
    theme?: Record<string, unknown>;
    logo_url?: string | null;
    favicon_url?: string | null;
    nav_items?: { label: string; href: string; icon?: string }[];
    footer_nav?: { label: string; href: string; icon?: string }[];
    features?: Record<string, boolean>;
    meta_title?: string | null;
    meta_description?: string | null;
    og_image_url?: string | null;
    social_links?: Record<string, string>;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteRow> {
  const sb = await getClient();

  const row: SiteInsert = {
    slug: input.slug,
    name: input.name,
    domain: input.domain,
    language: input.language ?? "en",
    direction: input.direction ?? "ltr",
  };

  if (input.is_active !== undefined) row.is_active = input.is_active;
  if (input.monetization_type !== undefined) row.monetization_type = input.monetization_type;
  if (input.est_revenue_per_click !== undefined)
    row.est_revenue_per_click = input.est_revenue_per_click;
  if (input.ad_config !== undefined) row.ad_config = input.ad_config;
  if (input.theme !== undefined) row.theme = input.theme;
  if (input.logo_url !== undefined) row.logo_url = input.logo_url;
  if (input.favicon_url !== undefined) row.favicon_url = input.favicon_url;
  if (input.nav_items !== undefined) row.nav_items = input.nav_items;
  if (input.footer_nav !== undefined) row.footer_nav = input.footer_nav;
  if (input.features !== undefined) row.features = input.features;
  if (input.meta_title !== undefined) row.meta_title = input.meta_title;
  if (input.meta_description !== undefined) row.meta_description = input.meta_description;
  if (input.og_image_url !== undefined) row.og_image_url = input.og_image_url;
  if (input.social_links !== undefined) row.social_links = input.social_links;

  const { data, error } = await sb.from(TABLE).insert(row).select().single();

  if (error) throw error;
  invalidateSiteCache();
  return assertRow<SiteRow>(data, "Site");
}

/** Update a site */
export async function updateSite(
  id: string,
  input: Partial<Omit<SiteRow, "id" | "slug" | "created_at" | "updated_at">>,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteRow> {
  const sb = await getClient();
  const updates: SiteUpdate = { ...input };
  const { data, error } = await sb.from(TABLE).update(updates).eq("id", id).select().single();

  if (error) throw error;
  invalidateSiteCache();
  return assertRow<SiteRow>(data, "Site");
}

/** Soft-delete a site (deactivate) */
export async function deactivateSite(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteRow> {
  return updateSite(id, { is_active: false }, getClient);
}

/** Hard-delete a site — requires super_admin role.
 *
 * A27-001: Hard delete is restricted to super_admin for maintenance only.
 * Regular deletion should use deactivateSite() (soft-delete via is_active=false).
 * This prevents accidental data loss and preserves referential integrity.
 */
export async function deleteSite(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
  callerRole?: string,
): Promise<void> {
  // A27-001: Only super_admin may hard-delete; regular admins must use soft-delete
  if (callerRole !== "super_admin") {
    throw new Error(
      "Hard delete requires super_admin role. Use deactivateSite() for soft deletion.",
    );
  }
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
  invalidateSiteCache();
}
