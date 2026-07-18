import { headers, cookies } from "next/headers";
import { getSiteById, allSites } from "@/config/sites";
import type { SiteDefinition } from "@/config/site-definition";
import { resolveDbSiteId, resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import type { SiteRow } from "@/types/database";
import { logger } from "@/lib/logger";

const SITE_HEADER = "x-site-id";
const SITE_COOKIE = "x-site-id";

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
      accentLightColor:
        theme?.accent_light_color ??
        theme?.accentLightColor ??
        theme?.accent_color ??
        theme?.accentColor ??
        "#3b82f6",
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

    monetizationType: row.monetization_type ?? "affiliate",
    affiliateDisclosure: "This site may earn a commission from qualifying purchases.",
    contentDisclosure: "Content is for informational purposes only.",

    estRevenuePerClick: row.est_revenue_per_click,

    features: {
      // Core features default to enabled so DB-only tenants are usable.
      newsletter: features.newsletter ?? true,
      searchModal: features.search ?? features.searchModal ?? true,
      scheduling: features.scheduling ?? true,
      cookieConsent: features.cookieConsent ?? true,
      blog: features.blog ? { source: "database" as const } : undefined,
      // Optional surfaces default to disabled until explicitly enabled.
      giftFinder: features.giftFinder ?? false,
      comparisons: features.comparisons ?? false,
      deals: features.deals ?? false,
      rssFeed: features.rssFeed ?? false,
      taxonomyPages: features.taxonomyPages ?? false,
      brandSpotlights: features.brandSpotlights ?? false,
      customHomepage: features.customHomepage ?? false,
      captchaOnLogin: features.captchaOnLogin ?? false,
      membership: features.membership ?? false,
      mediaKit: features.mediaKit ?? false,
      community: features.community ?? false,
    },

    pages: {
      about: { title: "About", description: `About ${row.name}` },
      privacy: { title: "Privacy Policy", description: `Privacy policy for ${row.name}` },
      terms: { title: "Terms of Service", description: `Terms of service for ${row.name}` },
    },

    seo: {
      // Admin UI is intentionally not advertised in robots.txt; it is
      // edge-gated by Cloudflare Access and unauthenticated requests to the
      // legacy /admin segment return 410 Gone via middleware.
      robotsDisallow: ["/api"],
      sitemapStaticPages: [
        { path: "/", priority: 1.0, changeFrequency: "daily" },
        { path: "/about", priority: 0.5, changeFrequency: "monthly" },
      ],
    },

    homepageTemplate: row.homepage_template ?? "standard",
    productCardStyle: row.product_card_style ?? "standard",
  };
}

/**
 * Read the active site from the request headers (set by middleware).
 * Resolves the database UUID so that site.id can be used directly in DAL queries.
 *
 * For sites defined in static config (config/sites/), uses the config and
 * overrides the id with the database UUID if available.
 *
 * For DB-only sites (created via admin panel), constructs a SiteDefinition
 * from the database row with sensible defaults.
 *
 * Falls back to the static config site if headers are not available
 * (e.g., during static generation at build time) or if DB lookup fails.
 */
export async function getCurrentSite(): Promise<SiteDefinition> {
  let siteSlug: string | null = null;

  try {
    const headerList = await headers();
    siteSlug = headerList.get(SITE_HEADER);
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    // Headers not available (e.g., during build time static generation)
  }

  // Fallback to cookie if header not available
  if (!siteSlug) {
    try {
      const cookieStore = await cookies();
      siteSlug = cookieStore.get(SITE_COOKIE)?.value ?? null;
      // S0-FP-004: in production, cookie-only site selection should be
      // logged as suspicious — the header is the trusted source set by
      // middleware, while cookies can be manipulated by the client.
      if (siteSlug && process.env.NODE_ENV === "production") {
        logger.warn("[site-context] site_id resolved from cookie only (no header)", {
          siteSlug,
        });
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // Cookies not available either
    }
  }

  // Fallback to NEXT_PUBLIC_DEFAULT_SITE only — do NOT silently fall back to
  // the first registered site.  In a multi-tenant context, serving the wrong
  // tenant's content is a correctness/security risk.
  if (!siteSlug) {
    siteSlug = process.env.NEXT_PUBLIC_DEFAULT_SITE ?? null;
  }

  if (!siteSlug) {
    // Build-time fallback: when NEXT_PHASE is "phase-production-build",
    // return the first registered site so `npm run build` can succeed
    // even without NEXT_PUBLIC_DEFAULT_SITE set.
    if (
      process.env.NODE_ENV === "production" &&
      process.env.NEXT_PHASE === "phase-production-build"
    ) {
      const firstSite = allSites[0];
      if (firstSite) {
        logger.warn("[site-context] Build-time fallback", {
          site: firstSite.id,
          hint: "Set NEXT_PUBLIC_DEFAULT_SITE in .env to configure explicitly",
        });
        return firstSite;
      }
    }
    throw new Error(
      "Cannot determine current site: no x-site-id header, cookie, or NEXT_PUBLIC_DEFAULT_SITE configured. " +
        "Set NEXT_PUBLIC_DEFAULT_SITE in your environment or ensure middleware injects x-site-id.",
    );
  }

  // 1. Try static config first (fast, no DB call for known sites)
  const site = getSiteById(siteSlug);
  if (site) {
    // Try to get DB UUID, but don't fail if DB is not available
    try {
      const dbSiteId = await resolveDbSiteId(siteSlug);
      return { ...site, id: dbSiteId };
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // DB not available or site not in DB yet - use static config
      return site;
    }
  }

  // 2. Fall back to DB lookup for DB-only sites (created via admin panel)
  try {
    const dbSite = await resolveDbSiteBySlug(siteSlug);
    if (dbSite) {
      return siteDefinitionFromDbRow(dbSite);
    }
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    // DB lookup failed
  }

  throw new Error(
    `No site found for slug "${siteSlug}". Register sites in config/sites/index.ts or the database.`,
  );
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
