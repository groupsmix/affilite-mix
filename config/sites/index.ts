import type { SiteDefinition, FeatureFlags } from "../site-definition";
import { aiComparedSite } from "./ai-compared";
import { arabicToolsSite } from "./arabic-tools";
import { cryptoToolsSite } from "./crypto-tools";
import { watchToolsSite } from "./watch-tools";

export { aiComparedSite, arabicToolsSite, cryptoToolsSite, watchToolsSite };

/** All registered sites. Add new sites here. */
export const allSites: SiteDefinition[] = [
  aiComparedSite,
  arabicToolsSite,
  cryptoToolsSite,
  watchToolsSite,
];

/* ------------------------------------------------------------------ */
/*  TS → DB row derivation (single source of truth)                    */
/* ------------------------------------------------------------------ */

/**
 * Shape of the DB-compatible row derived from a SiteDefinition.
 * Does NOT include `id` or timestamps — those are managed by Postgres.
 */
export interface DerivedSiteRow {
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: "ltr" | "rtl";
  is_active: boolean;
  monetization_type: "affiliate" | "ads" | "both";
  est_revenue_per_click: number;
  theme: Record<string, string>;
  logo_url: string | null;
  favicon_url: string | null;
  nav_items: { label: string; href: string }[];
  footer_nav: { label: string; href: string }[];
  features: Record<string, boolean>;
  meta_title: string;
  meta_description: string;
}

/**
 * Flatten FeatureFlags (which has `blog: { source: "database" }`) into
 * a plain `Record<string, boolean>` for the DB `features` jsonb column.
 */
function flattenFeatureFlags(flags: FeatureFlags): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(flags)) {
    out[key] = val != null && val !== false;
  }
  return out;
}

/**
 * Derive a DB-compatible site row from a SiteDefinition.
 *
 * This is the canonical way to generate seed / sync data for the `sites`
 * table — it eliminates the need to manually duplicate values from the TS
 * config into SQL migrations.
 */
export function toSiteRow(site: SiteDefinition): DerivedSiteRow {
  return {
    slug: site.id,
    name: site.name,
    domain: site.domain,
    language: site.language,
    direction: site.direction,
    is_active: true,
    monetization_type: site.monetizationType,
    est_revenue_per_click: site.estRevenuePerClick ?? 0.35,
    theme: {
      primaryColor: site.theme.primaryColor,
      accentColor: site.theme.accentColor,
      accentTextColor: site.theme.accentTextColor,
      fontHeading: site.theme.fontHeading,
      fontBody: site.theme.fontBody,
    },
    logo_url: site.brand.logo ?? null,
    favicon_url: site.brand.faviconUrl ?? null,
    nav_items: site.nav.map((n) => ({ label: n.title, href: n.href })),
    footer_nav: Object.values(site.footerNav)
      .flat()
      .map((n) => ({ label: n.title, href: n.href })),
    features: flattenFeatureFlags(site.features),
    meta_title: `${site.name} — ${site.brand.niche}`,
    meta_description: site.brand.description,
  };
}

/**
 * Generate an upsert SQL statement for a SiteDefinition.
 * Useful for generating seed migrations from the TS config.
 */
export function toSiteUpsertSQL(site: SiteDefinition): string {
  const row = toSiteRow(site);
  const esc = (s: string) => s.replace(/'/g, "''");
  return `INSERT INTO sites (slug, name, domain, language, direction, is_active, monetization_type, est_revenue_per_click, theme, nav_items, footer_nav, features, meta_title, meta_description)
VALUES (
  '${esc(row.slug)}',
  '${esc(row.name)}',
  '${esc(row.domain)}',
  '${esc(row.language)}',
  '${esc(row.direction)}',
  ${row.is_active},
  '${row.monetization_type}',
  ${row.est_revenue_per_click},
  '${esc(JSON.stringify(row.theme))}'::jsonb,
  '${esc(JSON.stringify(row.nav_items))}'::jsonb,
  '${esc(JSON.stringify(row.footer_nav))}'::jsonb,
  '${esc(JSON.stringify(row.features))}'::jsonb,
  '${esc(row.meta_title)}',
  '${esc(row.meta_description)}'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  is_active = EXCLUDED.is_active,
  monetization_type = EXCLUDED.monetization_type,
  est_revenue_per_click = EXCLUDED.est_revenue_per_click,
  theme = EXCLUDED.theme,
  nav_items = EXCLUDED.nav_items,
  footer_nav = EXCLUDED.footer_nav,
  features = EXCLUDED.features,
  meta_title = EXCLUDED.meta_title,
  meta_description = EXCLUDED.meta_description;`;
}

/**
 * Known wildcard parent domains.
 * Any subdomain of these is eligible for automatic DB-based resolution.
 *
 * Driven by the WILDCARD_PARENT_DOMAINS environment variable (comma-separated).
 * Defaults to ["wristnerd.xyz"] if the variable is not set, matching
 * the documented default in .env.example and the README.
 *
 * Example .env / wrangler secret:
 *   WILDCARD_PARENT_DOMAINS=wristnerd.xyz,groupsmix.com
 */
const WILDCARD_PARENT_DOMAINS_DEFAULT = ["wristnerd.xyz"];
const parsedWildcardParentDomains = (process.env.WILDCARD_PARENT_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean);
export const WILDCARD_PARENT_DOMAINS =
  parsedWildcardParentDomains.length > 0
    ? parsedWildcardParentDomains
    : WILDCARD_PARENT_DOMAINS_DEFAULT;

/** Lookup site by id */
export function getSiteById(id: string): SiteDefinition | undefined {
  return allSites.find((s) => s.id === id);
}

/**
 * Extract subdomain from a hostname given a parent domain.
 * e.g. extractSubdomain("coffee.wristnerd.xyz", "wristnerd.xyz") → "coffee"
 * Returns null if hostname doesn't match the parent or is the bare parent.
 */
export function extractSubdomain(hostname: string, parentDomain: string): string | null {
  const suffix = `.${parentDomain}`;
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  // Ignore empty or nested subdomains (only single-level wildcards)
  if (!sub || sub.includes(".")) return null;
  return sub;
}

/**
 * Check if a hostname is a wildcard subdomain of any known parent domain.
 * Returns the full hostname if it is (for DB lookup), or null.
 */
export function isWildcardSubdomain(hostname: string): boolean {
  return WILDCARD_PARENT_DOMAINS.some((parent) => extractSubdomain(hostname, parent) !== null);
}

/** Lookup site by domain or alias (config-only, synchronous) */
export function getSiteByDomain(hostname: string): SiteDefinition | undefined {
  // Direct match on domain or alias
  const direct = allSites.find((s) => s.domain === hostname || s.aliases?.includes(hostname));
  if (direct) return direct;

  // Development fallback: resolve localhost / *.localhost to a site
  if (process.env.NODE_ENV === "development") {
    // Check for <site>.localhost subdomains (e.g. watch.localhost)
    if (hostname.endsWith(".localhost")) {
      const prefix = hostname.replace(/\.localhost$/, "");
      const byAlias = allSites.find((s) => s.aliases?.some((a) => a.startsWith(prefix + ".")));
      if (byAlias) return byAlias;
    }

    // Fallback: use NEXT_PUBLIC_DEFAULT_SITE env var or the first registered site
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      const defaultSiteId = process.env.NEXT_PUBLIC_DEFAULT_SITE;
      if (defaultSiteId) {
        const byId = allSites.find((s) => s.id === defaultSiteId);
        if (byId) return byId;
      }
      return allSites[0];
    }
  }

  // For wildcard subdomains, return undefined so middleware can do an async DB lookup
  return undefined;
}
