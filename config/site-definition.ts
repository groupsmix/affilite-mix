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

  /** Homepage template preset. Set by defineSite(). Defaults to "standard". */
  _homepagePreset?: "standard" | "cinematic" | "minimal";
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
  commercial: boolean;
  layout: "standard" | "sidebar";
  minProducts?: number;
}

export interface NavItem {
  title: string;
  href: string;
  children?: NavItem[];
}
