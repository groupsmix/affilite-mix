import type {
  SiteDefinition,
  FeatureFlags,
  ContentTypeConfig,
  NavItem,
} from "./site-definition";

/* ------------------------------------------------------------------ */
/*  Font presets                                                       */
/* ------------------------------------------------------------------ */

export type FontPreset = "modern" | "classic" | "arabic" | "minimal";

const FONT_PRESETS: Record<FontPreset, { heading: string; body: string }> = {
  modern: { heading: "Inter", body: "Inter" },
  classic: { heading: "Playfair Display", body: "Inter" },
  arabic: { heading: "IBM Plex Sans Arabic", body: "IBM Plex Sans Arabic" },
  minimal: { heading: "Inter", body: "Inter" },
};

/* ------------------------------------------------------------------ */
/*  Homepage presets                                                    */
/* ------------------------------------------------------------------ */

export type HomepagePreset = "standard" | "cinematic" | "minimal";

/* ------------------------------------------------------------------ */
/*  Feature shorthands                                                 */
/* ------------------------------------------------------------------ */

export type FeatureShorthand =
  | "blog"
  | "brandSpotlights"
  | "comparisons"
  | "cookieConsent"
  | "deals"
  | "giftFinder"
  | "newsletter"
  | "rssFeed"
  | "scheduling"
  | "search"
  | "taxonomyPages";

function expandFeatures(shorthands: FeatureShorthand[]): FeatureFlags {
  const flags: FeatureFlags = {};
  for (const f of shorthands) {
    switch (f) {
      case "blog":
        flags.blog = { source: "database" };
        break;
      case "brandSpotlights":
        flags.brandSpotlights = true;
        break;
      case "comparisons":
        flags.comparisons = true;
        break;
      case "cookieConsent":
        flags.cookieConsent = true;
        break;
      case "deals":
        flags.deals = true;
        break;
      case "giftFinder":
        flags.giftFinder = true;
        break;
      case "newsletter":
        flags.newsletter = true;
        break;
      case "rssFeed":
        flags.rssFeed = true;
        break;
      case "scheduling":
        flags.scheduling = true;
        break;
      case "search":
        flags.searchModal = true;
        break;
      case "taxonomyPages":
        flags.taxonomyPages = true;
        break;
    }
  }
  return flags;
}

/* ------------------------------------------------------------------ */
/*  Default content types                                              */
/* ------------------------------------------------------------------ */

const DEFAULT_CONTENT_TYPES: ContentTypeConfig[] = [
  { value: "article", label: "Article", commercial: false, layout: "standard" },
  { value: "review", label: "Review", commercial: true, layout: "sidebar" },
  {
    value: "comparison",
    label: "Comparison",
    commercial: true,
    layout: "sidebar",
    minProducts: 2,
  },
  { value: "guide", label: "Guide", commercial: false, layout: "standard" },
];

/* ------------------------------------------------------------------ */
/*  Minimal site input                                                 */
/* ------------------------------------------------------------------ */

export interface SiteInput {
  /** Unique site identifier (kebab-case), e.g. "coffee-gear" */
  id: string;
  /** Display name, e.g. "BrewPerfect" */
  name: string;
  /** Primary domain, e.g. "brewperfect.com" */
  domain: string;
  /** Short niche description, e.g. "Coffee Equipment Reviews" */
  niche: string;

  /** Brand colors */
  colors: {
    /** Dark primary color for headings/nav, e.g. "#3C2415" */
    primary: string;
    /** Accent color for CTAs/links, e.g. "#D4A574" */
    accent: string;
  };

  /* ── Optional overrides (all have smart defaults) ─────────── */

  /** Additional domain aliases (including dev aliases) */
  aliases?: string[];
  /** Language code. Defaults to "en" */
  language?: string;
  /** Brand description (longer than niche). Defaults to niche. */
  description?: string;
  /** Contact email. Defaults to "contact@{domain}" */
  contactEmail?: string;
  /** Font preset or custom { heading, body }. Defaults to "modern" */
  fonts?: FontPreset | { heading: string; body: string };
  /** Homepage layout preset. Defaults to "standard" */
  homepage?: HomepagePreset;
  /** Feature list (shorthand). Defaults to common features. */
  features?: FeatureShorthand[];
  /** Full override of features (bypass shorthand expansion) */
  featureFlags?: FeatureFlags;
  /** Custom content types. Defaults to article/review/comparison/guide. */
  contentTypes?: ContentTypeConfig[];
  /** Product label singular. Defaults to "Product" */
  productLabel?: string;
  /** Product label plural. Defaults to "Products" */
  productLabelPlural?: string;
  /** Custom nav items. Auto-generated from content types if omitted. */
  nav?: NavItem[];
  /** Custom footer nav. Auto-generated if omitted. */
  footerNav?: Record<string, NavItem[]>;
  /** Custom affiliate disclosure text */
  affiliateDisclosure?: string;
  /** Custom content disclosure text */
  contentDisclosure?: string;
  /** Enable contact page. Defaults to true. */
  contactPage?: boolean;
  /** Enable affiliate disclosure page. Defaults to true. */
  affiliateDisclosurePage?: boolean;
  /** Extra sitemap static pages */
  sitemapExtraPages?: { path: string; priority: number; changeFrequency: string }[];
  /** Full override of the pages config */
  pages?: SiteDefinition["pages"];
  /** Full override of the SEO config */
  seo?: SiteDefinition["seo"];
  /** Brand logo URL */
  logo?: string;
  /** Favicon URL */
  faviconUrl?: string;
}

/* ------------------------------------------------------------------ */
/*  defineSite()                                                       */
/* ------------------------------------------------------------------ */

export function defineSite(input: SiteInput): SiteDefinition {
  const lang = input.language ?? "en";
  const isArabic = lang === "ar";
  const direction: "ltr" | "rtl" = isArabic ? "rtl" : "ltr";
  const locale = isArabic ? "ar_SA" : "en_US";
  const contactEmail = input.contactEmail ?? `contact@${input.domain}`;
  const description = input.description ?? input.niche;

  // Resolve fonts
  const fontConfig =
    typeof input.fonts === "string"
      ? FONT_PRESETS[input.fonts]
      : input.fonts
        ? input.fonts
        : isArabic
          ? FONT_PRESETS.arabic
          : FONT_PRESETS.modern;

  // Resolve features
  const defaultFeatures: FeatureShorthand[] = [
    "blog",
    "newsletter",
    "rssFeed",
    "search",
    "scheduling",
    "comparisons",
  ];
  const features = input.featureFlags ?? expandFeatures(input.features ?? defaultFeatures);

  // Apply homepage preset
  const homepage = input.homepage ?? "standard";
  if (homepage === "cinematic" || homepage === "minimal") {
    features.customHomepage = true;
  }

  // Content types
  const contentTypes = input.contentTypes ?? DEFAULT_CONTENT_TYPES;

  // Auto-generate nav from content types
  const nav = input.nav ?? generateNav(contentTypes, features, isArabic);

  // Auto-generate footer nav
  const footerNav = input.footerNav ?? generateFooterNav(contentTypes, input, isArabic);

  // Product labels
  const productLabel = input.productLabel ?? (isArabic ? "منتج" : "Product");
  const productLabelPlural = input.productLabelPlural ?? (isArabic ? "منتجات" : "Products");

  // Disclosures
  const affiliateDisclosure =
    input.affiliateDisclosure ??
    (isArabic
      ? "قد نحصل على عمولة من الروابط التابعة دون أي تكلفة إضافية عليك."
      : "This page contains affiliate links. We may earn a commission at no extra cost to you.");
  const contentDisclosure =
    input.contentDisclosure ??
    (isArabic
      ? "تحتوي هذه الصفحة على روابط تابعة. قد نحصل على عمولة إذا قمت بالتسجيل."
      : "This page contains affiliate links. We may earn a commission if you purchase through our links.");

  // Pages
  const pages = input.pages ?? generatePages(input, isArabic, contactEmail);

  // SEO
  const seo = input.seo ?? generateSeo(input, features);

  return {
    id: input.id,
    name: input.name,
    domain: input.domain,
    aliases: input.aliases,
    language: lang,
    direction,
    locale,
    homepageTemplate: homepage,

    brand: {
      description,
      contactEmail,
      niche: input.niche,
      logo: input.logo,
      faviconUrl: input.faviconUrl,
    },

    theme: {
      primaryColor: input.colors.primary,
      accentColor: input.colors.accent,
      fontHeading: fontConfig.heading,
      fontBody: fontConfig.body,
    },

    nav,
    footerNav,
    contentTypes,
    productLabel,
    productLabelPlural,
    affiliateDisclosure,
    contentDisclosure,
    features,
    pages,
    seo,
  };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function generateNav(
  contentTypes: ContentTypeConfig[],
  features: FeatureFlags,
  isArabic: boolean,
): NavItem[] {
  const nav: NavItem[] = [
    { title: isArabic ? "الرئيسية" : "Home", href: "/" },
  ];

  const labelMap: Record<string, string> = {
    article: isArabic ? "المقالات" : "Articles",
    review: isArabic ? "المراجعات" : "Reviews",
    comparison: isArabic ? "المقارنات" : "Comparisons",
    guide: isArabic ? "الأدلة" : "Guides",
  };

  for (const ct of contentTypes) {
    const label = labelMap[ct.value] ?? ct.label;
    nav.push({ title: label, href: `/${ct.value}` });
  }

  if (features.giftFinder) {
    nav.push({ title: isArabic ? "اختبار الهدايا" : "Gift Finder", href: "/gift-finder" });
  }

  return nav;
}

function generateFooterNav(
  contentTypes: ContentTypeConfig[],
  input: SiteInput,
  isArabic: boolean,
): Record<string, NavItem[]> {
  const quickLinks: NavItem[] = [
    { title: isArabic ? "الرئيسية" : "Home", href: "/" },
  ];
  for (const ct of contentTypes.slice(0, 3)) {
    const labelMap: Record<string, string> = {
      article: isArabic ? "المقالات" : "Articles",
      review: isArabic ? "المراجعات" : "Reviews",
      comparison: isArabic ? "المقارنات" : "Comparisons",
    };
    quickLinks.push({
      title: labelMap[ct.value] ?? ct.label,
      href: `/${ct.value}`,
    });
  }

  if (input.featureFlags?.giftFinder || input.features?.includes("giftFinder")) {
    quickLinks.push({
      title: isArabic ? "اختبار الهدايا" : "Gift Finder",
      href: "/gift-finder",
    });
  }

  const legal: NavItem[] = [
    { title: isArabic ? "عن الموقع" : "About", href: "/about" },
    { title: isArabic ? "سياسة الخصوصية" : "Privacy Policy", href: "/privacy" },
    { title: isArabic ? "الشروط والأحكام" : "Terms of Service", href: "/terms" },
  ];

  if (input.affiliateDisclosurePage !== false) {
    legal.push({
      title: isArabic ? "إفصاح الشركاء" : "Affiliate Disclosure",
      href: "/affiliate-disclosure",
    });
  }

  if (input.contactPage !== false) {
    legal.push({
      title: isArabic ? "اتصل بنا" : "Contact",
      href: "/contact",
    });
  }

  return { quickLinks, legal };
}

function generatePages(
  input: SiteInput,
  isArabic: boolean,
  contactEmail: string,
): SiteDefinition["pages"] {
  const pages: SiteDefinition["pages"] = {
    about: {
      title: isArabic ? `عن ${input.name}` : `About ${input.name}`,
      description: input.description ?? input.niche,
    },
    privacy: {
      title: isArabic ? "سياسة الخصوصية" : "Privacy Policy",
      description: isArabic ? "كيف نتعامل مع بياناتك" : "How we handle your data",
    },
    terms: {
      title: isArabic ? "الشروط والأحكام" : "Terms of Service",
      description: isArabic ? "شروط وأحكام الاستخدام" : "Terms and conditions of use",
    },
  };

  if (input.contactPage !== false) {
    pages.contact = {
      title: isArabic ? "اتصل بنا" : "Contact Us",
      description: isArabic
        ? `تواصل مع فريق ${input.name}`
        : `Get in touch with the ${input.name} team`,
      email: contactEmail,
    };
  }

  if (input.affiliateDisclosurePage !== false) {
    pages.affiliateDisclosurePage = {
      title: isArabic ? "إفصاح الشركاء" : "Affiliate Disclosure",
      description: isArabic
        ? "كيف نحقق الإيرادات ونحافظ على الاستقلالية التحريرية"
        : "How we earn revenue and maintain editorial independence",
    };
  }

  return pages;
}

function generateSeo(
  input: SiteInput,
  features: FeatureFlags,
): SiteDefinition["seo"] {
  const staticPages: SiteDefinition["seo"]["sitemapStaticPages"] = [
    { path: "/", priority: 1, changeFrequency: "daily" },
  ];

  if (features.giftFinder) {
    staticPages.push({ path: "/gift-finder", priority: 0.9, changeFrequency: "weekly" });
  }

  if (input.contactPage !== false) {
    staticPages.push({ path: "/contact", priority: 0.3, changeFrequency: "yearly" });
  }

  if (input.affiliateDisclosurePage !== false) {
    staticPages.push({ path: "/affiliate-disclosure", priority: 0.2, changeFrequency: "yearly" });
  }

  if (input.sitemapExtraPages) {
    staticPages.push(...input.sitemapExtraPages);
  }

  return {
    robotsDisallow: ["/admin/", "/api/"],
    sitemapStaticPages: staticPages,
  };
}
