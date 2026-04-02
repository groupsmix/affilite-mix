/**
 * Module Registry — defines all available modules for the platform.
 *
 * Each module represents a discrete feature set that can be enabled/disabled
 * per site via the dashboard. Module keys are used in the `site_modules` table.
 */

export interface ModuleDefinition {
  /** Unique key stored in the database */
  key: string;
  /** Human-readable name */
  name: string;
  /** Short description shown in the admin UI */
  description: string;
  /** Grouping category for the admin UI */
  category: "content" | "commerce" | "engagement" | "tools" | "seo";
  /** Whether this module is enabled by default for new sites */
  defaultEnabled: boolean;
  /** Icon key for the admin sidebar (matches admin icon set) */
  iconKey: string;
  /** Modules that this module depends on (must also be enabled) */
  dependencies: string[];
}

/**
 * All available modules in the platform.
 * Add new modules here — the admin UI reads this registry dynamically.
 */
export const MODULE_REGISTRY: readonly ModuleDefinition[] = [
  // ── Content modules ──────────────────────────────────────────────────
  {
    key: "blog",
    name: "Blog",
    description: "Articles, guides, and blog posts with rich text editing",
    category: "content",
    defaultEnabled: true,
    iconKey: "content",
    dependencies: [],
  },
  {
    key: "reviews",
    name: "Reviews",
    description: "Product review pages with ratings, pros/cons, and verdicts",
    category: "content",
    defaultEnabled: true,
    iconKey: "content",
    dependencies: ["affiliate_products"],
  },
  {
    key: "comparisons",
    name: "Comparisons",
    description: "Side-by-side product comparison pages",
    category: "content",
    defaultEnabled: true,
    iconKey: "content",
    dependencies: ["affiliate_products"],
  },
  {
    key: "pages",
    name: "Static Pages",
    description: "Custom static pages (about, contact, FAQ, etc.)",
    category: "content",
    defaultEnabled: true,
    iconKey: "pages",
    dependencies: [],
  },
  {
    key: "glossary",
    name: "Glossary",
    description: "Niche-specific glossary and terminology pages",
    category: "content",
    defaultEnabled: false,
    iconKey: "content",
    dependencies: [],
  },

  // ── Commerce modules ─────────────────────────────────────────────────
  {
    key: "affiliate_products",
    name: "Affiliate Products",
    description: "Product listings with affiliate links and click tracking",
    category: "commerce",
    defaultEnabled: true,
    iconKey: "products",
    dependencies: [],
  },
  {
    key: "deals",
    name: "Deals & Coupons",
    description: "Time-limited deals, coupons, and promotional offers",
    category: "commerce",
    defaultEnabled: false,
    iconKey: "products",
    dependencies: ["affiliate_products"],
  },
  {
    key: "brand_spotlights",
    name: "Brand Spotlights",
    description: "Dedicated brand/merchant spotlight pages",
    category: "commerce",
    defaultEnabled: false,
    iconKey: "products",
    dependencies: ["affiliate_products"],
  },

  // ── Engagement modules ───────────────────────────────────────────────
  {
    key: "newsletter",
    name: "Newsletter",
    description: "Email newsletter signup with double opt-in",
    category: "engagement",
    defaultEnabled: true,
    iconKey: "content",
    dependencies: [],
  },
  {
    key: "search",
    name: "Site Search",
    description: "Full-text search modal for content and products",
    category: "engagement",
    defaultEnabled: true,
    iconKey: "content",
    dependencies: [],
  },
  {
    key: "rss_feed",
    name: "RSS Feed",
    description: "Auto-generated RSS feed for blog content",
    category: "engagement",
    defaultEnabled: false,
    iconKey: "content",
    dependencies: ["blog"],
  },
  {
    key: "cookie_consent",
    name: "Cookie Consent",
    description: "GDPR-compliant cookie consent banner",
    category: "engagement",
    defaultEnabled: false,
    iconKey: "content",
    dependencies: [],
  },

  // ── Tools modules ────────────────────────────────────────────────────
  {
    key: "gift_finder",
    name: "Gift Finder",
    description: "Interactive gift recommendation tool",
    category: "tools",
    defaultEnabled: false,
    iconKey: "products",
    dependencies: ["affiliate_products"],
  },
  {
    key: "interactive_tools",
    name: "Interactive Tools",
    description: "Custom niche-specific interactive tools and calculators",
    category: "tools",
    defaultEnabled: false,
    iconKey: "products",
    dependencies: [],
  },

  // ── SEO modules ──────────────────────────────────────────────────────
  {
    key: "taxonomy_pages",
    name: "Taxonomy Pages",
    description: "Auto-generated category and tag landing pages",
    category: "seo",
    defaultEnabled: true,
    iconKey: "categories",
    dependencies: [],
  },
  {
    key: "scheduling",
    name: "Content Scheduling",
    description: "Schedule content for future publication",
    category: "seo",
    defaultEnabled: true,
    iconKey: "content",
    dependencies: ["blog"],
  },
  {
    key: "ads",
    name: "Ad Placements",
    description: "Display ad placement management (AdSense, Carbon, etc.)",
    category: "commerce",
    defaultEnabled: false,
    iconKey: "ads",
    dependencies: [],
  },
] as const;

/** Look up a module definition by key */
export function getModuleDefinition(key: string): ModuleDefinition | undefined {
  return MODULE_REGISTRY.find((m) => m.key === key);
}

/** Get all module keys */
export function getAllModuleKeys(): string[] {
  return MODULE_REGISTRY.map((m) => m.key);
}

/** Get default-enabled module keys */
export function getDefaultEnabledModules(): string[] {
  return MODULE_REGISTRY.filter((m) => m.defaultEnabled).map((m) => m.key);
}

/** Group modules by category */
export function getModulesByCategory(): Record<string, ModuleDefinition[]> {
  const grouped: Record<string, ModuleDefinition[]> = {};
  for (const mod of MODULE_REGISTRY) {
    if (!grouped[mod.category]) {
      grouped[mod.category] = [];
    }
    grouped[mod.category].push(mod);
  }
  return grouped;
}
