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
