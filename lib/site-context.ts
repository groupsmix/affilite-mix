import { headers } from "next/headers";
import { getSiteById } from "@/config/sites";
import type { SiteDefinition } from "@/config/site-definition";
import { resolveDbSiteId, resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import type { SiteRow } from "@/types/database";

const SITE_HEADER = "x-site-id";

/**
 * Construct a SiteDefinition from a database SiteRow.
 * Used for DB-only sites that don't have a static config entry.
 */
function siteDefinitionFromDbRow(row: SiteRow): SiteDefinition {
  const theme = row.theme as Record<string, string> | null;
  const features = row.features ?? {};

  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    language: row.language,
    direction: row.direction,
    locale: row.language === "ar" ? "ar-SA" : `${row.language}-US`,

    brand: {
      description: row.meta_description ?? `${row.name} — curated content and recommendations`,
      contactEmail: `contact@${row.domain}`,
      niche: row.name,
      logo: row.logo_url ?? undefined,
      faviconUrl: row.favicon_url ?? undefined,
    },

    theme: {
      primaryColor: theme?.primary_color ?? theme?.primaryColor ?? "#1f2937",
      accentColor: theme?.accent_color ?? theme?.accentColor ?? "#3b82f6",
      accentTextColor: theme?.accent_text_color ?? theme?.accentTextColor ?? "#2563eb",
      fontHeading: theme?.font_heading ?? theme?.fontHeading ?? theme?.font ?? "Inter",
      fontBody: theme?.font_body ?? theme?.fontBody ?? theme?.font ?? "Inter",
    },

    nav: (row.nav_items ?? []).map((n) => ({ title: n.label, href: n.href })),
    footerNav: {
      main: (row.footer_nav ?? []).map((n) => ({ title: n.label, href: n.href })),
    },

    contentTypes: [
      { value: "article", label: "Article", commercial: false, layout: "standard" as const },
      { value: "review", label: "Review", commercial: true, layout: "sidebar" as const },
      { value: "guide", label: "Guide", commercial: false, layout: "standard" as const },
      { value: "blog", label: "Blog", commercial: false, layout: "standard" as const },
    ],
    productLabel: "Product",
    productLabelPlural: "Products",

    affiliateDisclosure: "This site may earn a commission from qualifying purchases.",
    contentDisclosure: "Content is for informational purposes only.",

    estRevenuePerClick: row.est_revenue_per_click,

    features: {
      newsletter: features.newsletter ?? true,
      searchModal: features.search ?? features.searchModal ?? true,
      giftFinder: features.giftFinder ?? false,
      scheduling: features.scheduling ?? true,
      blog: features.blog ? { source: "database" as const } : undefined,
      cookieConsent: features.cookieConsent ?? false,
    },

    pages: {
      about: { title: "About", description: `About ${row.name}` },
      privacy: { title: "Privacy Policy", description: `Privacy policy for ${row.name}` },
      terms: { title: "Terms of Service", description: `Terms of service for ${row.name}` },
    },

    seo: {
      robotsDisallow: ["/admin", "/api"],
      sitemapStaticPages: [
        { path: "/", priority: 1.0, changeFrequency: "daily" },
        { path: "/about", priority: 0.5, changeFrequency: "monthly" },
      ],
    },
  };
}

/**
 * Read the active site from the request headers (set by middleware).
 * Resolves the database UUID so that site.id can be used directly in DAL queries.
 *
 * For sites defined in static config (config/sites/), uses the config and
 * overrides the id with the database UUID.
 *
 * For DB-only sites (created via admin panel), constructs a SiteDefinition
 * from the database row with sensible defaults.
 */
export async function getCurrentSite(): Promise<SiteDefinition> {
  const headerList = await headers();
  const siteSlug = headerList.get(SITE_HEADER);

  if (!siteSlug) {
    throw new Error("x-site-id header missing — is middleware running?");
  }

  // 1. Try static config first (fast, no DB call for known sites)
  const site = getSiteById(siteSlug);
  if (site) {
    const dbSiteId = await resolveDbSiteId(siteSlug);
    return { ...site, id: dbSiteId };
  }

  // 2. Fall back to DB lookup for DB-only sites (created via admin panel)
  const dbSite = await resolveDbSiteBySlug(siteSlug);
  if (dbSite) {
    return siteDefinitionFromDbRow(dbSite);
  }

  throw new Error(`Site not found in config or database: ${siteSlug}`);
}

/**
 * Extract site_id from a raw header value (for use in API route handlers).
 * Returns the slug as-is — callers that need the DB UUID should use resolveDbSiteId.
 */
export function getSiteIdFromHeader(headerValue: string | null): string {
  if (!headerValue) {
    throw new Error("x-site-id header missing");
  }
  return headerValue;
}
