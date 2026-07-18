import type { SiteDefinition } from "@/config/site-definition";
import { allSites, getSiteByDomain, getSiteById, toSiteRow } from "@/config/sites";
import type { SiteRow } from "@/types/database";

export type SiteConfigAuthority = "config" | "database";

export interface AdminSiteRecord {
  id: string;
  slug: string;
  name: string;
  domain: string;
  language: string;
  direction: string;
  is_active: boolean;
  monetization_type: string;
  est_revenue_per_click?: number;
  theme: Record<string, unknown>;
  features?: Record<string, boolean>;
  meta_title?: string | null;
  meta_description?: string | null;
  homepage_template?: string;
  product_card_style?: string;
  source: SiteConfigAuthority;
  db_id?: string;
  is_provisioned: boolean;
  database_is_active?: boolean;
  created_at?: string;
}

export function isStaticConfigSiteSlug(slug: string): boolean {
  return getSiteById(slug) !== undefined;
}

export function isStaticConfigSite(site: Pick<SiteDefinition, "domain">): boolean {
  return getSiteByDomain(site.domain) !== undefined;
}

export function buildAdminSiteRegistry(dbSites: SiteRow[]): AdminSiteRecord[] {
  const dbBySlug = new Map(dbSites.map((site) => [site.slug, site]));
  const configSlugs = new Set(allSites.map((site) => site.id));

  const databaseSites = dbSites
    .filter((site) => !configSlugs.has(site.slug))
    .map(
      (site): AdminSiteRecord => ({
        id: site.slug,
        slug: site.slug,
        name: site.name,
        domain: site.domain,
        language: site.language,
        direction: site.direction,
        is_active: site.is_active,
        monetization_type: site.monetization_type,
        est_revenue_per_click: site.est_revenue_per_click,
        theme: site.theme,
        features: site.features,
        meta_title: site.meta_title,
        meta_description: site.meta_description,
        homepage_template: site.homepage_template,
        product_card_style: site.product_card_style,
        source: "database",
        db_id: site.id,
        is_provisioned: true,
        database_is_active: site.is_active,
        created_at: site.created_at,
      }),
    );

  const configSites = allSites.map((site): AdminSiteRecord => {
    const dbSite = dbBySlug.get(site.id);
    const derived = toSiteRow(site);

    return {
      id: site.id,
      slug: site.id,
      name: site.name,
      domain: site.domain,
      language: site.language,
      direction: site.direction,
      is_active: true,
      monetization_type: site.monetizationType,
      est_revenue_per_click: site.estRevenuePerClick,
      theme: derived.theme,
      features: derived.features,
      meta_title: derived.meta_title,
      meta_description: derived.meta_description,
      homepage_template: derived.homepage_template,
      product_card_style: derived.product_card_style,
      source: "config",
      db_id: dbSite?.id,
      is_provisioned: dbSite !== undefined,
      database_is_active: dbSite?.is_active,
      created_at: dbSite?.created_at,
    };
  });

  return [...databaseSites, ...configSites];
}
