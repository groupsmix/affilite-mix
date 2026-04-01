import { getServiceClient, getAnonClient } from "@/lib/supabase-server";
import type { SiteRow } from "@/types/database";
import type { Database } from "@/types/supabase";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

type SiteInsert = Database["public"]["Tables"]["sites"]["Insert"];
type SiteUpdate = Database["public"]["Tables"]["sites"]["Update"];

const TABLE = "sites";
// Columns needed for list views (excludes heavy JSON blobs like ad_config, custom_css)
const LIST_COLUMNS =
  "id, slug, name, domain, language, direction, is_active, monetization_type, logo_url, favicon_url, meta_title, meta_description, og_image_url, created_at, updated_at" as const;

/* ------------------------------------------------------------------ */
/*  In-memory cache with TTL                                           */
/* ------------------------------------------------------------------ */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 200;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const siteBySlugCache = new Map<string, CacheEntry<SiteRow>>();
const siteByDomainCache = new Map<string, CacheEntry<SiteRow>>();
let allSitesCache: CacheEntry<SiteRow[]> | null = null;

function evictOldest<T>(cache: Map<string, CacheEntry<T>>) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
}

/** Invalidate all site caches (call after create/update/delete) */
export function invalidateSiteCache(): void {
  siteBySlugCache.clear();
  siteByDomainCache.clear();
  allSitesCache = null;
}

/* ------------------------------------------------------------------ */
/*  Read operations (with caching)                                     */
/* ------------------------------------------------------------------ */

/** List all sites (cached) */
export async function listSites(): Promise<SiteRow[]> {
  if (allSitesCache && Date.now() < allSitesCache.expiresAt) {
    return allSitesCache.value;
  }

  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: true });

  if (error) throw error;
  const rows = assertRows<SiteRow>(data);

  allSitesCache = { value: rows, expiresAt: Date.now() + CACHE_TTL_MS };
  return rows;
}

/** List all active sites (cached, filtered) */
export async function getAllActiveSites(): Promise<SiteRow[]> {
  const all = await listSites();
  return all.filter((s) => s.is_active);
}

/** Get a single site by its database UUID */
export async function getSiteRowById(id: string): Promise<SiteRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SiteRow>(data);
}

/** Get a single site by slug (cached) */
export async function getSiteRowBySlug(slug: string): Promise<SiteRow | null> {
  const cached = siteBySlugCache.get(slug);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const sb = getAnonClient();
  const { data, error } = await sb.from(TABLE).select("*").eq("slug", slug).single();

  if (error && error.code !== "PGRST116") throw error;
  const row = rowOrNull<SiteRow>(data);

  if (row) {
    evictOldest(siteBySlugCache);
    siteBySlugCache.set(slug, { value: row, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return row;
}

/** Get a single site by domain (cached) */
export async function getSiteRowByDomain(domain: string): Promise<SiteRow | null> {
  const cached = siteByDomainCache.get(domain);
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const sb = getAnonClient();
  const { data, error } = await sb.from(TABLE).select("*").eq("domain", domain).single();

  if (error && error.code !== "PGRST116") throw error;
  const row = rowOrNull<SiteRow>(data);

  if (row) {
    evictOldest(siteByDomainCache);
    siteByDomainCache.set(domain, { value: row, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return row;
}

/* ------------------------------------------------------------------ */
/*  Write operations (invalidate cache on mutation)                    */
/* ------------------------------------------------------------------ */

/** Create a new site */
export async function createSite(input: {
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
  custom_css?: string | null;
}): Promise<SiteRow> {
  const sb = getServiceClient();

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
  if (input.custom_css !== undefined) row.custom_css = input.custom_css;

  const { data, error } = await sb.from(TABLE).insert(row).select().single();

  if (error) throw error;
  invalidateSiteCache();
  return assertRow<SiteRow>(data, "Site");
}

/** Update a site */
export async function updateSite(
  id: string,
  input: Partial<Omit<SiteRow, "id" | "slug" | "created_at" | "updated_at">>,
): Promise<SiteRow> {
  const sb = getServiceClient();
  const updates: SiteUpdate = { ...input };
  const { data, error } = await sb.from(TABLE).update(updates).eq("id", id).select().single();

  if (error) throw error;
  invalidateSiteCache();
  return assertRow<SiteRow>(data, "Site");
}

/** Soft-delete a site (deactivate) */
export async function deactivateSite(id: string): Promise<SiteRow> {
  return updateSite(id, { is_active: false });
}

/** Delete a site permanently */
export async function deleteSite(id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
  invalidateSiteCache();
}
