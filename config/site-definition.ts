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
      lastModified?: string;
    }[];
  };

  /** Homepage template preset. Defaults to "standard". */
  homepageTemplate?: "standard" | "cinematic" | "minimal";

  /**
   * Per-tenant cost / usage ceilings (G-42).
   *
   * Optional per-site override of the global ceilings configured via
   * `QUOTA_DEFAULT_*` environment variables. When unset, the global
   * defaults apply. See `lib/quotas.ts` and `docs/per-tenant-quotas.md`.
   */
  quotas?: TenantQuotaOverrides;
}

/**
 * Per-tenant ceilings. Every field is optional; an unset field inherits
 * the corresponding global default from `QUOTA_DEFAULT_*` env vars and
 * is treated as unlimited if neither is set.
 *
 * Window semantics:
 *   - `*PerMonth` counters reset on the first of each calendar month UTC.
 *   - `*PerDay`   counters reset at 00:00 UTC.
 *   - `*Bytes`    counters are cumulative (storage; not reset).
 */
export interface TenantQuotaOverrides {
  /** Maximum AI tokens (input + output, estimated) per calendar month. */
  aiTokensPerMonth?: number;
  /** Maximum estimated AI cost (USD, scaled by 1e6 micro-dollars) per month. */
  aiCostMicroUsdPerMonth?: number;
  /** Maximum AI generation requests per day (rate-shaping). */
  aiRequestsPerDay?: number;
  /** Maximum cumulative R2 storage (bytes) per tenant. */
  r2StorageBytes?: number;
  /** Maximum R2 egress per month (bytes). */
  r2EgressBytesPerMonth?: number;
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
type MonetizationModule =
  | "affiliate_links"
  | "display_ads"
  | "newsletter_sponsor"
  | "lead_gen"
  | "paid_membership"
  | "price_alerts"
  | "sponsored_reviews";
