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
  };

  seo: {
    robotsDisallow: string[];
    sitemapStaticPages: {
      path: string;
      priority: number;
      changeFrequency: string;
    }[];
  };
}

export interface FeatureFlags {
  blog?: { source: "database" };
  brandSpotlights?: boolean;
  newsletter?: boolean;
  rssFeed?: boolean;
  searchModal?: boolean;
  scheduling?: boolean;
  comparisons?: boolean;
  deals?: boolean;
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
