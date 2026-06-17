// DESIGN: No site_id filtering — this module manages the `sites` table itself (global scope).
import { unstable_cache } from "next/cache";
import { getTenantClient } from "@/lib/supabase-server";
import { shouldSkipDbCall } from "@/lib/db-available";
import type { SiteRow } from "@/types/database";
import type { Database, Json } from "@/types/supabase";
import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { siteLookupFlight } from "@/lib/singleflight";

type SiteInsert = Database["public"]["Tables"]["sites"]["Insert"];
type SiteUpdate = Database["public"]["Tables"]["sites"]["Update"];

const TABLE = "sites";
// Columns needed for list views (excludes heavy JSON blobs like ad_config, custom_css)
const LIST_COLUMNS =
  "id, slug, name, domain, language, direction, is_active, monetization_type, logo_url, favicon_url, meta_title, meta_description, og_image_url, homepage_template, product_card_style, created_at, updated_at" as const;
// A23-01: Explicit full-row column list — prevents future sensitive columns from
// leaking automatically when callers receive a complete SiteRow.
const ALL_COLUMNS =
  "id, slug, name, domain, language, direction, is_active, monetization_type, est_revenue_per_click, ad_config, theme, logo_url, favicon_url, nav_items, footer_nav, features, meta_title, meta_description, og_image_url, social_links, homepage_template, product_card_style, created_at, updated_at" as const;

/* ------------------------------------------------------------------ */
/*  Read operations (with unstable_cache)                              */
/* ------------------------------------------------------------------ */

/** List all sites (cached) */
export const listSites = unstable_cache(
  async (getClient: DalClientGetter = defaultDalClientGetter): Promise<SiteRow[]> => {
    if (shouldSkipDbCall()) return [];

    const sb = await getClient();
    const { data, error } = await sb
      .from(TABLE)
      .select(LIST_COLUMNS)
      // SAFE: listing the global site registry — no tenant scope applies here.
      .unsafeNoSiteFilter()
      .order("created_at", { ascending: true });

    if (error) throw error;
    return assertRows<SiteRow>(data);
  },
  ["all-sites"],
  { revalidate: 10, tags: ["sites"] },
);

/** Get a single site by its database UUID */
export async function getSiteRowById(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteRow | null> {
  if (shouldSkipDbCall()) return null;

  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    // SAFE: `sites` is the global tenant registry and cannot be site-scoped by id beforehand.
    .unsafeNoSiteFilter()
    .eq("id", id)
    .single();

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
  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    // SAFE: resolving a site by slug queries the global tenant registry.
    .unsafeNoSiteFilter()
    .eq("slug", slug)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SiteRow>(data);
}

/** Get a single site by slug (cached + singleflight coalesced) */
const _getSiteRowBySlugCached = unstable_cache(
  async (slug: string): Promise<SiteRow | null> => {
    return getSiteRowBySlugWithClient(slug, getTenantClient);
  },
  ["site-by-slug"],
  { revalidate: 10, tags: ["sites"] },
);

// S9-H2: Wrap with singleflight so concurrent cache-miss requests for the
// same slug share a single in-flight DB query instead of each independently
// hitting Supabase.
export async function getSiteRowBySlug(slug: string): Promise<SiteRow | null> {
  return siteLookupFlight.do(`slug:${slug}`, () =>
    _getSiteRowBySlugCached(slug),
  ) as Promise<SiteRow | null>;
}

/** Get a single site by domain (cached + singleflight coalesced) */
const _getSiteRowByDomainCached = unstable_cache(
  async (domain: string): Promise<SiteRow | null> => {
    if (shouldSkipDbCall()) return null;

    const sb = await getTenantClient();
    const { data, error } = await sb.from(TABLE).select(ALL_COLUMNS).eq("domain", domain).single();

    if (error && error.code !== "PGRST116") throw error;
    return rowOrNull<SiteRow>(data);
  },
  ["site-by-domain"],
  { revalidate: 10, tags: ["sites"] },
);

// S9-H2: Wrap with singleflight so concurrent cache-miss requests for the
// same domain share a single in-flight DB query.
export async function getSiteRowByDomain(domain: string): Promise<SiteRow | null> {
  return siteLookupFlight.do(`domain:${domain}`, () =>
    _getSiteRowByDomainCached(domain),
  ) as Promise<SiteRow | null>;
}

/* ------------------------------------------------------------------ */
/*  Write operations                                                  */
/* ------------------------------------------------------------------ */
import { revalidateTag } from "next/cache";
import { getAppCacheKV } from "@/lib/runtime-env";
import { logger } from "@/lib/logger";

/**
 * S9-C3: Invalidate both Next.js unstable_cache AND middleware KV cache.
 *
 * The middleware caches site-domain mappings in KV with a 60s TTL
 * (`site-domain:<hostname>`). Without explicit deletion during
 * invalidation there is a window where stale KV entries point to old
 * site data after a domain change — a cross-tenant data leak.
 */
function invalidateSiteCache(oldDomain?: string, newDomain?: string): void {
  revalidateTag("sites");

  void (async () => {
    try {
      const kv = getAppCacheKV();
      if (!kv) return;

      const domainsToDelete = new Set<string>();
      if (oldDomain) domainsToDelete.add(oldDomain);
      if (newDomain) domainsToDelete.add(newDomain);

      if (domainsToDelete.size === 0) {
        const sites = await listSites();
        for (const site of sites) {
          if (site.domain) domainsToDelete.add(site.domain);
        }
      }

      await Promise.allSettled(
        [...domainsToDelete].flatMap((domain) => [
          kv.delete(`site-domain:${domain}`),
          kv.delete(`site-domain-miss:${domain}`),
        ]),
      );
    } catch (e) {
      logger.warn("[sites] KV cache invalidation failed", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  })();
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
    homepage_template?: "standard" | "cinematic" | "minimal" | "editorial" | "top10";
    product_card_style?: "standard" | "compact" | "detailed";
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
  if (input.ad_config !== undefined) row.ad_config = input.ad_config as unknown as Json;
  if (input.theme !== undefined) row.theme = input.theme as unknown as Json;
  if (input.logo_url !== undefined) row.logo_url = input.logo_url;
  if (input.favicon_url !== undefined) row.favicon_url = input.favicon_url;
  if (input.nav_items !== undefined) row.nav_items = input.nav_items;
  if (input.footer_nav !== undefined) row.footer_nav = input.footer_nav;
  if (input.features !== undefined) row.features = input.features;
  if (input.meta_title !== undefined) row.meta_title = input.meta_title;
  if (input.meta_description !== undefined) row.meta_description = input.meta_description;
  if (input.og_image_url !== undefined) row.og_image_url = input.og_image_url;
  if (input.social_links !== undefined) row.social_links = input.social_links;
  if (input.homepage_template !== undefined) row.homepage_template = input.homepage_template;
  if (input.product_card_style !== undefined) row.product_card_style = input.product_card_style;

  const { data, error } = await sb
    .from(TABLE)
    .insert(row)
    .select()
    // SAFE: creating a tenant writes the global `sites` registry itself.
    .unsafeNoSiteFilter()
    .single();

  if (error) throw error;
  invalidateSiteCache(undefined, input.domain);
  return assertRow<SiteRow>(data, "Site");
}

/** Update a site */
export async function updateSite(
  id: string,
  input: Partial<Omit<SiteRow, "id" | "slug" | "created_at" | "updated_at">>,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteRow> {
  const sb = await getClient();

  // S9-C3: Capture the old domain before the update so we can invalidate
  // both old and new KV cache entries during a domain migration.
  let oldDomain: string | undefined;
  if (input.domain) {
    const existing = await getSiteRowById(id, getClient);
    oldDomain = existing?.domain ?? undefined;
  }

  // MA-001 (defence-in-depth): server-controlled columns must never be
  // mutated by a client-supplied payload. The TypeScript signature
  // already excludes them, but `input` is `Record<string, unknown>` at
  // runtime when the call comes through a JSON parse + spread. Strip
  // them here so a future route that forgets the explicit allow-list
  // can still not regress the immutability guarantee.
  const sanitized = { ...(input as Record<string, unknown>) };
  delete sanitized.id;
  delete sanitized.slug;
  delete sanitized.created_at;
  delete sanitized.updated_at;
  const updates: SiteUpdate = sanitized as SiteUpdate;
  const { data, error } = await sb
    .from(TABLE)
    .update(updates)
    // SAFE: updating a tenant definition targets the global `sites` registry.
    .unsafeNoSiteFilter()
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  invalidateSiteCache(oldDomain, input.domain ?? undefined);
  return assertRow<SiteRow>(data, "Site");
}

/** Hard-delete a site — requires super_admin role.
 *
 * A27-001: Hard delete is restricted to super_admin for maintenance only.
 * Regular deletion should use `updateSite(id, { is_active: false })` (soft-delete).
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
      "Hard delete requires super_admin role. Use updateSite(id, { is_active: false }) for soft deletion.",
    );
  }
  const sb = await getClient();
  const existing = await getSiteRowById(id, getClient);
  const { error } = await sb
    .from(TABLE)
    .delete()
    // SAFE: hard-deleting a tenant is an explicit global control-plane operation.
    .unsafeNoSiteFilter()
    .eq("id", id);
  if (error) throw error;
  invalidateSiteCache(existing?.domain ?? undefined);
}
