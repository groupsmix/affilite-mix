import { getPageBySlug } from "@/lib/dal/pages";

export type WatchTier = "under-200" | "under-300" | "under-500";

export interface Watch {
  id: string;
  name: string;
  brand: string;
  image: string;
  imageAlt?: string;
  price: number;
  rating: number;
  reviewCount: number;
  tier: WatchTier;
  category: string;
  movement: string;
  waterResistance: string;
  caseSize: string;
  bestFor: string;
  editorNote: string;
  pros: string[];
  cons: string[];
  affiliateUrl: string;
  editorsChoice?: boolean;
}

export interface DialPriceTier {
  id: WatchTier;
  label: string;
  tagline: string;
  /** Optional guide slug to route to from the fixed header on non-homepage pages. */
  guideSlug?: string;
  /** Computed from the watches array when the config is loaded. */
  count?: number;
}

export interface DialNavLink {
  label: string;
  href: string;
}

export interface DialTrustStat {
  icon: "clock" | "gem" | "users" | "banknote";
  value: string;
  label: string;
}

export interface DialMethodologyStep {
  icon:
    | "checkCircle"
    | "calendar"
    | "ruler"
    | "droplets"
    | "wallet"
    | "hand"
    | "gauge"
    | "microscope";
  title: string;
  description: string;
}

export interface DialHomepageConfig {
  navLinks: DialNavLink[];
  hero: {
    badge: string;
    title: string;
    highlight: string;
    subtitle: string;
    ctaPrimary: { label: string; href: string };
    ctaSecondary: { label: string; href: string };
    heroImage: string;
    heroImageAlt: string;
    trustRating: string;
    trustReviews: string;
  };
  trustBar: {
    stats: DialTrustStat[];
  };
  priceTiers: DialPriceTier[];
  topPicks: {
    title: string;
    subtitle: string;
  };
  tierSections: {
    title: string;
    subtitle: string;
    allGuidesHref: string;
    allGuidesLabel: string;
  };
  comparisonTable: {
    title: string;
    subtitle: string;
    ctaLabel: string;
  };
  howWeTest: {
    title: string;
    subtitle: string;
    steps: DialMethodologyStep[];
  };
  newsletter: {
    title: string;
    subtitle: string;
    buttonLabel: string;
    placeholder: string;
    disclaimer: string;
    successMessage: string;
  };
  watches: Watch[];
}

export const DIAL_HOMEPAGE_SLUG = "dial-homepage";

export const defaultWatches: Watch[] = [
  {
    id: "navigator-automatic",
    name: "Kamasu",
    brand: "Orient",
    image: "https://m.media-amazon.com/images/I/61SZSflqb-L._AC_SL1500_.jpg",
    imageAlt: "Orient Kamasu automatic dive watch with blue dial",
    price: 320,
    rating: 4.8,
    reviewCount: 2140,
    tier: "under-500",
    category: "Dive",
    movement: "Automatic",
    waterResistance: "200m",
    caseSize: "41.8mm",
    bestFor: "Everyday all-rounder",
    editorNote:
      "The best value automatic diver we tested this year. Sapphire crystal and a 200m rating at this price is genuinely rare.",
    pros: ["Sapphire crystal", "True 200m water resistance", "Smooth automatic movement"],
    cons: ["Bracelet uses pin-and-collar links"],
    affiliateUrl: "https://www.amazon.com/dp/B07QJP9TGP",
    editorsChoice: true,
  },
  {
    id: "heritage-field",
    name: "Khaki Field Mechanical",
    brand: "Hamilton",
    image: "https://m.media-amazon.com/images/I/41PauP84vhL._AC_SL1500_.jpg",
    imageAlt: "Hamilton Khaki Field Mechanical watch on a canvas strap",
    price: 495,
    rating: 4.7,
    reviewCount: 1580,
    tier: "under-500",
    category: "Field",
    movement: "Mechanical",
    waterResistance: "50m",
    caseSize: "38mm",
    bestFor: "Minimalist everyday wear",
    editorNote:
      "A faithful military reissue with an 80-hour power reserve and a clean, legible dial. The canvas strap feels authentic and wears comfortably.",
    pros: ["80-hour power reserve", "Sapphire crystal", "Hand-wound charm"],
    cons: ["No date window", "Lume is modest"],
    affiliateUrl: "https://www.amazon.com/s?k=Hamilton+Khaki+Field+Mechanical+H69439931",
  },
  {
    id: "sterling-dress",
    name: "Fairfield 37mm",
    brand: "Timex",
    image: "https://m.media-amazon.com/images/I/61iVvul3sxL._AC_SL1500_.jpg",
    imageAlt: "Timex Fairfield 37mm dress watch with cream dial and mesh bracelet",
    price: 145,
    rating: 4.6,
    reviewCount: 940,
    tier: "under-200",
    category: "Dress",
    movement: "Quartz",
    waterResistance: "30m",
    caseSize: "37mm",
    bestFor: "Formal & office wear",
    editorNote:
      "A clean quartz dress watch with a slim case and mesh bracelet. It slips under a cuff and pairs with everything.",
    pros: ["Ultra-thin profile", "Elegant dial", "Indiglo night light"],
    cons: ["Low water resistance", "Mineral crystal"],
    affiliateUrl: "https://www.amazon.com/dp/B079KV9MHS",
  },
  {
    id: "retro-digital",
    name: "A168WA-1",
    brand: "Casio",
    image: "https://m.media-amazon.com/images/I/613BThUhjoL._AC_SL1500_.jpg",
    imageAlt: "Casio A168WA vintage digital watch with stainless steel band",
    price: 65,
    rating: 4.5,
    reviewCount: 5620,
    tier: "under-200",
    category: "Vintage / Digital",
    movement: "Quartz (Digital)",
    waterResistance: "30m",
    caseSize: "36mm",
    bestFor: "Retro everyday style",
    editorNote:
      "The cult classic. Indestructible, iconic, and impossibly cheap — a no-brainer starter or beater watch.",
    pros: ["Iconic design", "Nearly indestructible", "Incredible price"],
    cons: ["Small display", "Resin-era feel"],
    affiliateUrl: "https://www.amazon.com/dp/B000LAKYW8",
  },
  {
    id: "circuit-chrono",
    name: "SSB399P1",
    brand: "Seiko",
    image: "https://m.media-amazon.com/images/I/41Jx6SOeeYL._AC_SL1500_.jpg",
    imageAlt: "Seiko SSB399P1 quartz chronograph with black dial",
    price: 245,
    rating: 4.7,
    reviewCount: 760,
    tier: "under-300",
    category: "Chronograph",
    movement: "Quartz Chronograph",
    waterResistance: "100m",
    caseSize: "41mm",
    bestFor: "Sporty daily driver",
    editorNote:
      "A 100m quartz chronograph from a household name. The black dial with silver sub-dials is legible, versatile, and tough enough for daily wear.",
    pros: ["100m water resistance", "Reliable quartz chronograph", "Versatile black-dial look"],
    cons: ["Thick 12.3mm case", "Hardlex crystal"],
    affiliateUrl: "https://www.amazon.com/s?k=Seiko+SSB399P1",
  },
  {
    id: "aria-minimalist",
    name: "Signatur Lille",
    brand: "Skagen",
    image: "https://m.media-amazon.com/images/I/31gptbCa0JL._AC_SL1500_.jpg",
    imageAlt: "Skagen Signatur Lille two-hand watch with rose gold mesh strap",
    price: 115,
    rating: 4.6,
    reviewCount: 1320,
    tier: "under-200",
    category: "Minimalist",
    movement: "Quartz",
    waterResistance: "30m",
    caseSize: "30mm",
    bestFor: "Women’s everyday minimalist",
    editorNote:
      "A refined 30mm case with a mesh strap that dresses up or down. Our top pick in the women’s minimalist category.",
    pros: ["Elegant mesh strap", "Versatile size", "Great gift option"],
    cons: ["Not water-resistant for swimming"],
    affiliateUrl: "https://www.amazon.com/s?k=Skagen+Signatur+Lille",
  },
  {
    id: "casio-duro-walmart",
    name: "Men's Black Dive Style Sport Watch MDV106-1AV",
    brand: "Casio",
    image: "https://m.media-amazon.com/images/I/61nHUVwR65L._AC_SL1500_.jpg",
    imageAlt: "Casio MDV106-1AV black dive watch with black resin band",
    price: 66.26,
    rating: 4.7,
    reviewCount: 1200,
    tier: "under-200",
    category: "Dive",
    movement: "Quartz",
    waterResistance: "200m",
    caseSize: "44mm",
    bestFor: "Entry-level diver / beater",
    editorNote:
      "The Casio Duro is the budget diver everyone recommends. 200m water resistance, screw-down crown, and a stainless steel case for under $70.",
    pros: ["200m water resistance", "Screw-down crown", "Incredible value"],
    cons: ["Resin band wears quickly", "Mineral crystal"],
    affiliateUrl: "https://sovrn.co/1m9tdvu",
  },
];

export const defaultDialConfig: DialHomepageConfig = {
  navLinks: [
    { label: "Under $300", href: "/best-watches-under-300" },
    { label: "Under $500", href: "/best-watches-under-500" },
    { label: "Best Dress", href: "/best-dress-watch-under-500" },
    { label: "Top Picks", href: "/#top-picks" },
    { label: "How We Test", href: "/#how-we-test" },
  ],
  hero: {
    badge: "Independent reviews · Reader-supported",
    title: "The best watches under $500,",
    highlight: "actually tested",
    subtitle:
      "No fluff, no paid rankings. We buy, wear, and rate affordable watches so you can spend with confidence — organized by exactly how much you want to spend.",
    ctaPrimary: { label: "Explore top picks", href: "#top-picks" },
    ctaSecondary: { label: "Shop by budget", href: "#tier-under-200" },
    heroImage: "https://m.media-amazon.com/images/I/71IRSZa3DnL._AC_SL1500_.jpg",
    heroImageAlt: "Black dive watch with luminous markers on a dark background",
    trustRating: "",
    trustReviews: "",
  },
  trustBar: {
    stats: [
      { icon: "gem", value: "0", label: "Watches reviewed" },
      { icon: "banknote", value: "$0", label: "Paid placements" },
    ],
  },
  priceTiers: [
    {
      id: "under-200",
      label: "Under $200",
      tagline: "Best value entry points",
      guideSlug: "best-watches-under-200",
    },
    {
      id: "under-300",
      label: "Under $300",
      tagline: "The everyday sweet spot",
      guideSlug: "best-watches-under-300",
    },
    {
      id: "under-500",
      label: "Under $500",
      tagline: "Step-up quality picks",
      guideSlug: "best-watches-under-500",
    },
  ],
  topPicks: {
    title: "Our top picks right now",
    subtitle:
      "The watches we’d actually spend our own money on this season — chosen for build quality, accuracy, and value.",
  },
  tierSections: {
    title: "Winners by budget",
    subtitle:
      "Not everyone needs the same spend ceiling. Here are the standouts sorted by price tier.",
    allGuidesHref: "/guide",
    allGuidesLabel: "All guides →",
  },
  comparisonTable: {
    title: "Compare every pick at a glance",
    subtitle:
      "Sorted by our overall rating. Tap any watch to check the current price with our retail partners.",
    ctaLabel: "Check price",
  },
  howWeTest: {
    title: "Why you can trust these rankings",
    subtitle:
      "We’re reader-supported, not brand-supported. Rankings are never for sale, and any watch can be delisted if quality slips. Here’s exactly how every pick earns its place.",
    steps: [
      {
        icon: "wallet",
        title: "We buy them ourselves",
        description:
          "No loaners, no manufacturer samples. We purchase every watch at retail so our verdicts stay honest.",
      },
      {
        icon: "hand",
        title: "Two weeks on the wrist",
        description:
          "Each watch gets worn daily for at least two weeks to judge comfort, legibility, and real-world wearability.",
      },
      {
        icon: "gauge",
        title: "Accuracy timed",
        description:
          "We measure daily rate deviation and water resistance claims so you know the specs actually hold up.",
      },
      {
        icon: "microscope",
        title: "Build quality graded",
        description:
          "Case finishing, crystal type, bracelet feel, and lume are scored against watches that cost far more.",
      },
    ],
  },
  newsletter: {
    title: "Get the best watch deals, weekly",
    subtitle:
      "One email a week with fresh reviews and the best price drops we spot under $500. No spam, unsubscribe anytime.",
    buttonLabel: "Subscribe",
    placeholder: "you@example.com",
    disclaimer: "By subscribing you agree to our Privacy Policy and affiliate disclosure.",
    successMessage: "You’re in — check your inbox to confirm.",
  },
  watches: defaultWatches,
};

function isWatchTier(value: unknown): value is WatchTier {
  return value === "under-200" || value === "under-300" || value === "under-500";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === "boolean";
}

function coerceWatch(raw: unknown): Watch | null {
  if (!isObject(raw)) return null;
  const id = raw.id;
  const name = raw.name;
  const brand = raw.brand;
  const image = raw.image;
  const price = raw.price;
  const rating = raw.rating;
  const reviewCount = raw.reviewCount;
  const tier = raw.tier;
  const category = raw.category;
  const movement = raw.movement;
  const waterResistance = raw.waterResistance;
  const caseSize = raw.caseSize;
  const bestFor = raw.bestFor;
  const editorNote = raw.editorNote;
  const pros = raw.pros;
  const cons = raw.cons;
  const affiliateUrl = raw.affiliateUrl;

  if (
    !isString(id) ||
    !isString(name) ||
    !isString(brand) ||
    !isString(image) ||
    !isNumber(price) ||
    !isNumber(rating) ||
    !isNumber(reviewCount) ||
    !isWatchTier(tier) ||
    !isString(category) ||
    !isString(movement) ||
    !isString(waterResistance) ||
    !isString(caseSize) ||
    !isString(bestFor) ||
    !isString(editorNote) ||
    !isStringArray(pros) ||
    !isStringArray(cons) ||
    !isString(affiliateUrl) ||
    !isOptionalBoolean(raw.editorsChoice)
  ) {
    return null;
  }

  return {
    id,
    name,
    brand,
    image,
    imageAlt: isString(raw.imageAlt) ? raw.imageAlt : `${brand} ${name} watch`,
    price,
    rating,
    reviewCount,
    tier,
    category,
    movement,
    waterResistance,
    caseSize,
    bestFor,
    editorNote,
    pros,
    cons,
    affiliateUrl,
    editorsChoice: raw.editorsChoice,
  };
}

function coerceStringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return isStringArray(value) ? value : undefined;
}

const OLD_SAMPLE_IMAGE_PREFIX = "/watches/";

function isOldSampleImage(url: unknown): boolean {
  return isString(url) && url.startsWith(OLD_SAMPLE_IMAGE_PREFIX);
}

function hasAmazonReferral(url: string): boolean {
  try {
    const u = new URL(url);
    return u.searchParams.has("tag") || u.searchParams.has("ref");
  } catch {
    return false;
  }
}

function getAmazonSearchUrl(brand: string, name: string): string {
  const query = `${brand} ${name}`.replace(/\s+/g, " ").trim();
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
}

function isAmazonHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "amazon.com" || host.endsWith(".amazon.com");
  } catch {
    return false;
  }
}

function appendAmazonTag(url: string): string {
  const tag = process.env.AMAZON_ASSOCIATE_TAG;
  if (!tag || !isAmazonHost(url)) return url;
  try {
    const u = new URL(url);
    if (u.searchParams.has("tag")) return url;
    u.searchParams.set("tag", tag);
    return u.toString();
  } catch {
    return url;
  }
}

function resolveWatchAffiliateUrl(watch: Watch): string {
  const url = watch.affiliateUrl?.trim() ?? "";
  if (url.length > 0) {
    const isAmazon = isAmazonHost(url);
    if (isAmazon && !process.env.AMAZON_ASSOCIATE_TAG && !hasAmazonReferral(url)) {
      return "";
    }
    return appendAmazonTag(url);
  }
  if (process.env.AMAZON_ASSOCIATE_TAG) {
    const searchUrl = getAmazonSearchUrl(watch.brand, watch.name);
    return appendAmazonTag(searchUrl);
  }
  return "";
}

function rebaseWatches(sourceWatches: Watch[], defaults: Watch[]): Watch[] {
  const defaultsById = new Map(defaults.map((w) => [w.id, w] as const));
  const merged = new Map<string, Watch>();

  for (const watch of sourceWatches) {
    const fallback = defaultsById.get(watch.id);
    // If the image is still an old sample render, rebase the whole watch to
    // the current default so design/image/affiliate updates always ship.
    merged.set(watch.id, fallback && isOldSampleImage(watch.image) ? fallback : watch);
  }

  for (const watch of defaults) {
    if (!merged.has(watch.id)) {
      merged.set(watch.id, watch);
    }
  }

  const base = defaults.map((watch) => merged.get(watch.id) ?? watch);
  const extras = sourceWatches.filter((w) => !defaultsById.has(w.id));
  return [...base, ...extras].map((watch) => ({
    ...watch,
    affiliateUrl: resolveWatchAffiliateUrl(watch),
  }));
}

export function mergeWithDefault(input: unknown): DialHomepageConfig {
  const source = isObject(input) ? input : {};
  const watchesRaw = source.watches;
  const parsedWatches = Array.isArray(watchesRaw)
    ? watchesRaw.map(coerceWatch).filter((w): w is Watch => w !== null)
    : [];
  const watches = rebaseWatches(parsedWatches, defaultDialConfig.watches);

  const priceTiersRaw = source.priceTiers;
  const priceTiers = Array.isArray(priceTiersRaw)
    ? priceTiersRaw
        .map((t: unknown): DialPriceTier | null => {
          if (!isObject(t)) return null;
          const id = t.id;
          const label = t.label;
          const tagline = t.tagline;
          const guideSlug = t.guideSlug;
          return isWatchTier(id) && isString(label) && isString(tagline)
            ? {
                id,
                label,
                tagline,
                guideSlug: isString(guideSlug) ? guideSlug : undefined,
                count: watches.filter((w) => w.tier === id).length,
              }
            : null;
        })
        .filter((t): t is DialPriceTier => t !== null)
    : defaultDialConfig.priceTiers.map((t) => ({
        ...t,
        count: watches.filter((w) => w.tier === t.id).length,
      }));

  let hero = isObject(source.hero)
    ? {
        badge: isString(source.hero.badge) ? source.hero.badge : defaultDialConfig.hero.badge,
        title: isString(source.hero.title) ? source.hero.title : defaultDialConfig.hero.title,
        highlight: isString(source.hero.highlight)
          ? source.hero.highlight
          : defaultDialConfig.hero.highlight,
        subtitle: isString(source.hero.subtitle)
          ? source.hero.subtitle
          : defaultDialConfig.hero.subtitle,
        ctaPrimary: isObject(source.hero.ctaPrimary)
          ? {
              label: isString(source.hero.ctaPrimary.label)
                ? source.hero.ctaPrimary.label
                : defaultDialConfig.hero.ctaPrimary.label,
              href: isString(source.hero.ctaPrimary.href)
                ? source.hero.ctaPrimary.href
                : defaultDialConfig.hero.ctaPrimary.href,
            }
          : defaultDialConfig.hero.ctaPrimary,
        ctaSecondary: isObject(source.hero.ctaSecondary)
          ? {
              label: isString(source.hero.ctaSecondary.label)
                ? source.hero.ctaSecondary.label
                : defaultDialConfig.hero.ctaSecondary.label,
              href: isString(source.hero.ctaSecondary.href)
                ? source.hero.ctaSecondary.href
                : defaultDialConfig.hero.ctaSecondary.href,
            }
          : defaultDialConfig.hero.ctaSecondary,
        heroImage:
          isString(source.hero.heroImage) && !isOldSampleImage(source.hero.heroImage)
            ? source.hero.heroImage
            : defaultDialConfig.hero.heroImage,
        heroImageAlt: isString(source.hero.heroImageAlt)
          ? source.hero.heroImageAlt
          : defaultDialConfig.hero.heroImageAlt,
        trustRating: isString(source.hero.trustRating)
          ? source.hero.trustRating
          : defaultDialConfig.hero.trustRating,
        trustReviews: isString(source.hero.trustReviews)
          ? source.hero.trustReviews
          : defaultDialConfig.hero.trustReviews,
      }
    : defaultDialConfig.hero;

  const sourceNavLinks = Array.isArray(source.navLinks)
    ? source.navLinks
        .map((l: unknown): DialNavLink | null => {
          if (!isObject(l)) return null;
          const label = l.label;
          const href = l.href;
          return isString(label) && isString(href) ? { label, href } : null;
        })
        .filter((l): l is DialNavLink => l !== null)
    : [];
  const sourceHrefs = new Set(sourceNavLinks.map((l) => l.href));
  const missingDefaults = defaultDialConfig.navLinks.filter((l) => !sourceHrefs.has(l.href));
  const navLinks =
    sourceNavLinks.length > 0
      ? [...sourceNavLinks, ...missingDefaults]
      : defaultDialConfig.navLinks;

  let trustBar = isObject(source.trustBar)
    ? {
        stats: Array.isArray(source.trustBar.stats)
          ? source.trustBar.stats
              .map((s: unknown): DialTrustStat | null => {
                if (!isObject(s)) return null;
                const icon = s.icon;
                const value = s.value;
                const label = s.label;
                return isString(icon) &&
                  ["clock", "gem", "users", "banknote"].includes(icon) &&
                  isString(value) &&
                  isString(label)
                  ? { icon: icon as DialTrustStat["icon"], value, label }
                  : null;
              })
              .filter((s): s is DialTrustStat => s !== null)
          : defaultDialConfig.trustBar.stats,
      }
    : defaultDialConfig.trustBar;

  // Replace any hardcoded/inflated marketing numbers with values derived from
  // the actual watch inventory so the homepage never overstates what the tier
  // pages actually contain.
  const watchCount = watches.length;
  const brandCount = new Set(watches.map((w) => w.brand)).size;
  const tierCount = priceTiers.length;

  hero = {
    ...hero,
    trustReviews: `${watchCount} watch${watchCount === 1 ? "" : "es"} reviewed`,
  };

  trustBar = {
    stats: [
      {
        icon: "gem",
        value: String(watchCount),
        label: `Watch${watchCount === 1 ? "" : "es"} reviewed`,
      },
      {
        icon: "users",
        value: String(brandCount),
        label: `Brand${brandCount === 1 ? "" : "s"} covered`,
      },
      { icon: "clock", value: String(tierCount), label: "Price tiers" },
    ],
  };

  const topPicks = isObject(source.topPicks)
    ? {
        title: isString(source.topPicks.title)
          ? source.topPicks.title
          : defaultDialConfig.topPicks.title,
        subtitle: isString(source.topPicks.subtitle)
          ? source.topPicks.subtitle
          : defaultDialConfig.topPicks.subtitle,
      }
    : defaultDialConfig.topPicks;

  const tierSections = isObject(source.tierSections)
    ? {
        title: isString(source.tierSections.title)
          ? source.tierSections.title
          : defaultDialConfig.tierSections.title,
        subtitle: isString(source.tierSections.subtitle)
          ? source.tierSections.subtitle
          : defaultDialConfig.tierSections.subtitle,
        allGuidesHref: isString(source.tierSections.allGuidesHref)
          ? source.tierSections.allGuidesHref
          : defaultDialConfig.tierSections.allGuidesHref,
        allGuidesLabel: isString(source.tierSections.allGuidesLabel)
          ? source.tierSections.allGuidesLabel
          : defaultDialConfig.tierSections.allGuidesLabel,
      }
    : defaultDialConfig.tierSections;

  const comparisonTable = isObject(source.comparisonTable)
    ? {
        title: isString(source.comparisonTable.title)
          ? source.comparisonTable.title
          : defaultDialConfig.comparisonTable.title,
        subtitle: isString(source.comparisonTable.subtitle)
          ? source.comparisonTable.subtitle
          : defaultDialConfig.comparisonTable.subtitle,
        ctaLabel: isString(source.comparisonTable.ctaLabel)
          ? source.comparisonTable.ctaLabel
          : defaultDialConfig.comparisonTable.ctaLabel,
      }
    : defaultDialConfig.comparisonTable;

  const howWeTest = isObject(source.howWeTest)
    ? {
        title: isString(source.howWeTest.title)
          ? source.howWeTest.title
          : defaultDialConfig.howWeTest.title,
        subtitle: isString(source.howWeTest.subtitle)
          ? source.howWeTest.subtitle
          : defaultDialConfig.howWeTest.subtitle,
        steps: Array.isArray(source.howWeTest.steps)
          ? source.howWeTest.steps
              .map((s: unknown): DialMethodologyStep | null => {
                if (!isObject(s)) return null;
                const icon = s.icon;
                const title = s.title;
                const description = s.description;
                return isString(icon) &&
                  [
                    "checkCircle",
                    "calendar",
                    "ruler",
                    "droplets",
                    "wallet",
                    "hand",
                    "gauge",
                    "microscope",
                  ].includes(icon) &&
                  isString(title) &&
                  isString(description)
                  ? { icon: icon as DialMethodologyStep["icon"], title, description }
                  : null;
              })
              .filter((s): s is DialMethodologyStep => s !== null)
          : defaultDialConfig.howWeTest.steps,
      }
    : defaultDialConfig.howWeTest;

  const newsletter = isObject(source.newsletter)
    ? {
        title: isString(source.newsletter.title)
          ? source.newsletter.title
          : defaultDialConfig.newsletter.title,
        subtitle: isString(source.newsletter.subtitle)
          ? source.newsletter.subtitle
          : defaultDialConfig.newsletter.subtitle,
        buttonLabel: isString(source.newsletter.buttonLabel)
          ? source.newsletter.buttonLabel
          : defaultDialConfig.newsletter.buttonLabel,
        placeholder: isString(source.newsletter.placeholder)
          ? source.newsletter.placeholder
          : defaultDialConfig.newsletter.placeholder,
        disclaimer: isString(source.newsletter.disclaimer)
          ? source.newsletter.disclaimer
          : defaultDialConfig.newsletter.disclaimer,
        successMessage: isString(source.newsletter.successMessage)
          ? source.newsletter.successMessage
          : defaultDialConfig.newsletter.successMessage,
      }
    : defaultDialConfig.newsletter;

  return {
    navLinks,
    hero,
    trustBar,
    priceTiers,
    topPicks,
    tierSections,
    comparisonTable,
    howWeTest,
    newsletter,
    watches,
  };
}

export async function getDialHomepageConfig(siteId: string): Promise<DialHomepageConfig> {
  const page = await getPageBySlug(siteId, DIAL_HOMEPAGE_SLUG);
  if (!page?.body) {
    return mergeWithDefault({});
  }

  try {
    const parsed = JSON.parse(page.body) as unknown;
    return mergeWithDefault(parsed);
  } catch {
    return defaultDialConfig;
  }
}
