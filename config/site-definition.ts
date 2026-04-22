/** Site configuration — single source of truth for all site-specific behavior */

export interface SiteDefinition {
  id: string;
  name: string;
  domain: string;
  aliases?: string[];
  language: string;
  direction: "ltr" | "rtl";
  locale: string;

  brand: {
    description: string;
    contactEmail: string;
    niche: string;
    logo?: string;
    faviconUrl?: string;
  };

  theme: {
    primaryColor: string;
    accentColor: string;
    /**
     * WCAG AA-compliant variant of accentColor for use as text on white.
     * Must meet 4.5:1 contrast ratio against #FFFFFF.
     * Falls back to accentColor if not set.
     */
    accentTextColor: string;
    fontHeading: string;
    fontBody: string;
  };

  nav: NavItem[];
  footerNav: Record<string, NavItem[]>;

  contentTypes: ContentTypeConfig[];
  productLabel: string;
  productLabelPlural: string;

  affiliateDisclosure: string;
  contentDisclosure: string;

  /** How this site earns revenue. Controls which UI blocks render. */
  monetizationType: "affiliate" | "ads" | "both";

  /**
   * Fine-grained monetization modules. Replaces the coarse monetizationType enum.
   * When present, monetizationType is derived from this list for backward compat.
   */
  monetizationModules?: MonetizationModule[];

  /** Estimated revenue per affiliate click (USD). Used in admin analytics. */
  estRevenuePerClick?: number;

  features: FeatureFlags;

  pages: {
    about: { title: string; description: string };
    privacy: { title: string; description: string };
    terms: { title: string; description: string };
    contact?: { title: string; description: string; email: string };
    affiliateDisclosurePage?: { title: string; description: string };
  };

  seo: {
    robotsDisallow: string[];
    sitemapStaticPages: {
      path: string;
      priority: number;
      changeFrequency: string;
    }[];
  };

  /** Homepage template preset. Defaults to "standard". */
  homepageTemplate?: "standard" | "cinematic" | "minimal";
}

export interface FeatureFlags {
  blog?: { source: "database" };
  brandSpotlights?: boolean;
  giftFinder?: boolean;
  newsletter?: boolean;
  rssFeed?: boolean;
  searchModal?: boolean;
  scheduling?: boolean;
  comparisons?: boolean;
  deals?: boolean;
  cookieConsent?: boolean;
  taxonomyPages?: boolean;
  customHomepage?: boolean;
}

export interface ContentTypeConfig {
  value: string;
  label: string;
  labelPlural?: string;
  commercial: boolean;
  layout: "standard" | "sidebar";
  minProducts?: number;
}

export interface NavItem {
  title: string;
  href: string;
  children?: NavItem[];
}

/** Fine-grained monetization modules — each drives different UX and accounting. */
export type MonetizationModule =
  | "affiliate_links"
  | "display_ads"
  | "newsletter_sponsor"
  | "lead_gen"
  | "paid_membership"
  | "price_alerts"
  | "sponsored_reviews";

/**
 * Derive the legacy monetizationType enum from a monetizationModules array.
 * Used for backward compatibility with existing UI code.
 */
export function deriveMonetizationType(
  modules: MonetizationModule[] | undefined,
): "affiliate" | "ads" | "both" {
  if (!modules || modules.length === 0) return "both";
  const hasAffiliate = modules.includes("affiliate_links");
  const hasAds = modules.includes("display_ads");
  if (hasAffiliate && hasAds) return "both";
  if (hasAds) return "ads";
  return "affiliate";
}
