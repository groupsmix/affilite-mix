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
  icon: "checkCircle" | "calendar" | "ruler" | "droplets";
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
    name: "Navigator Automatic",
    brand: "Meridian",
    image: "/watches/diver.png",
    imageAlt: "Meridian Navigator Automatic dive watch",
    price: 320,
    rating: 4.8,
    reviewCount: 2140,
    tier: "under-500",
    category: "Dive",
    movement: "Automatic",
    waterResistance: "200m",
    caseSize: "40mm",
    bestFor: "Everyday all-rounder",
    editorNote:
      "The best value automatic diver we tested this year. Sapphire crystal and a 200m rating at this price is genuinely rare.",
    pros: ["Sapphire crystal", "True 200m water resistance", "Smooth automatic movement"],
    cons: ["Bracelet uses pin-and-collar links"],
    affiliateUrl: "#",
    editorsChoice: true,
  },
  {
    id: "heritage-field",
    name: "Heritage Field 38",
    brand: "Ridgeline",
    image: "/watches/field.png",
    imageAlt: "Ridgeline Heritage Field 38 watch",
    price: 189,
    rating: 4.7,
    reviewCount: 1580,
    tier: "under-200",
    category: "Field",
    movement: "Mechanical",
    waterResistance: "100m",
    caseSize: "38mm",
    bestFor: "Minimalist everyday wear",
    editorNote:
      "A crisp, legible field watch that punches far above its price. The leather strap feels premium out of the box.",
    pros: ["Excellent legibility", "Quality leather strap", "Hand-wound charm"],
    cons: ["No date window", "Lume is modest"],
    affiliateUrl: "#",
  },
  {
    id: "sterling-dress",
    name: "Sterling Slim",
    brand: "Aveline",
    image: "/watches/dress.png",
    imageAlt: "Aveline Sterling Slim dress watch",
    price: 245,
    rating: 4.6,
    reviewCount: 940,
    tier: "under-300",
    category: "Dress",
    movement: "Quartz",
    waterResistance: "30m",
    caseSize: "39mm",
    bestFor: "Formal & office wear",
    editorNote:
      "At just 6.5mm thick, this slips under any cuff. The dauphine hands and clean dial look far more expensive than they are.",
    pros: ["Ultra-thin profile", "Elegant dial", "Great value for formal wear"],
    cons: ["Low water resistance", "Quartz, not mechanical"],
    affiliateUrl: "#",
  },
  {
    id: "retro-digital",
    name: "Retro Digital Gold",
    brand: "Kasato",
    image: "/watches/vintage.png",
    imageAlt: "Kasato Retro Digital Gold vintage style watch",
    price: 79,
    rating: 4.5,
    reviewCount: 5620,
    tier: "under-200",
    category: "Vintage / Digital",
    movement: "Quartz (Digital)",
    waterResistance: "50m",
    caseSize: "36mm",
    bestFor: "Retro everyday style",
    editorNote:
      "The cult classic. Indestructible, iconic, and impossibly cheap — a no-brainer starter or beater watch.",
    pros: ["Iconic design", "Nearly indestructible", "Incredible price"],
    cons: ["Small display", "Resin-era feel"],
    affiliateUrl: "#",
  },
  {
    id: "circuit-chrono",
    name: "Circuit Chronograph",
    brand: "Meridian",
    image: "/watches/chrono.png",
    imageAlt: "Meridian Circuit Chronograph watch",
    price: 420,
    rating: 4.7,
    reviewCount: 760,
    tier: "under-500",
    category: "Chronograph",
    movement: "Meca-quartz",
    waterResistance: "100m",
    caseSize: "41mm",
    bestFor: "Sporty daily driver",
    editorNote:
      "Meca-quartz gives you the snappy pusher feel of a mechanical chrono without the four-figure price tag.",
    pros: ["Snappy chronograph feel", "Panda dial legibility", "Sapphire crystal"],
    cons: ["Slightly thick", "Loud tachymeter styling"],
    affiliateUrl: "#",
  },
  {
    id: "aria-minimalist",
    name: "Aria Minimalist",
    brand: "Aveline",
    image: "/watches/minimalist.png",
    imageAlt: "Aveline Aria Minimalist women's watch",
    price: 155,
    rating: 4.6,
    reviewCount: 1320,
    tier: "under-200",
    category: "Minimalist",
    movement: "Quartz",
    waterResistance: "30m",
    caseSize: "34mm",
    bestFor: "Women’s everyday minimalist",
    editorNote:
      "A refined 34mm case with a mesh strap that dresses up or down. Our top pick in the women’s minimalist category.",
    pros: ["Elegant mesh strap", "Versatile size", "Great gift option"],
    cons: ["Not water-resistant for swimming"],
    affiliateUrl: "#",
  },
];

export const defaultDialConfig: DialHomepageConfig = {
  navLinks: [
    { label: "Under $300", href: "/guide/best-watches-under-300" },
    { label: "Under $500", href: "/guide/best-watches-under-500" },
    { label: "Best Dress", href: "/guide/best-dress-watch-under-500" },
    { label: "Top Picks", href: "#top-picks" },
    { label: "How We Test", href: "#how-we-test" },
  ],
  hero: {
    badge: "Independent reviews · Reader-supported",
    title: "The best watches under $500,",
    highlight: "actually tested",
    subtitle:
      "We wear, time, and photograph every pick. No sponsored rankings, no manufacturer quotes — just honest buying guides for every budget.",
    ctaPrimary: { label: "See top picks", href: "#top-picks" },
    ctaSecondary: { label: "How we test watches", href: "#how-we-test" },
    heroImage: "/watches/hero-watch.png",
    heroImageAlt: "Featured automatic watch on a dark editorial background",
    trustRating: "4.8/5",
    trustReviews: "from 12,000+ readers",
  },
  trustBar: {
    stats: [
      { icon: "clock", value: "600+", label: "Hours of testing" },
      { icon: "gem", value: "120+", label: "Watches on wrist" },
      { icon: "users", value: "85k+", label: "Monthly readers" },
      { icon: "banknote", value: "$0", label: "Paid placements" },
    ],
  },
  priceTiers: [
    { id: "under-200", label: "Under $200", tagline: "Best value entry points" },
    { id: "under-300", label: "Under $300", tagline: "The everyday sweet spot" },
    { id: "under-500", label: "Under $500", tagline: "Step-up quality picks" },
  ],
  topPicks: {
    title: "Top rated this month",
    subtitle:
      "These are the watches we keep reaching for. Every pick below was worn for at least two weeks before scoring.",
  },
  tierSections: {
    title: "Winners by budget",
    subtitle:
      "Not everyone needs the same spend ceiling. Here are the standouts sorted by price tier.",
    allGuidesHref: "/guide",
    allGuidesLabel: "All guides →",
  },
  comparisonTable: {
    title: "Head-to-head comparison",
    subtitle:
      "The same specs, side by side. Sort by rating to see which watch leads the pack for your budget.",
    ctaLabel: "Check price",
  },
  howWeTest: {
    title: "How we test",
    subtitle:
      "Our methodology is designed to remove hype and focus on what matters: accuracy, comfort, and value.",
    steps: [
      {
        icon: "checkCircle",
        title: "We buy or borrow every watch",
        description:
          "No loaner units from marketing teams. If a watch is reviewed, it spent real time on a real wrist.",
      },
      {
        icon: "calendar",
        title: "Two weeks minimum on wrist",
        description:
          "First impressions lie. We wear each pick for desk work, weekend errands, and nights out before scoring.",
      },
      {
        icon: "ruler",
        title: "Accuracy timed against real time",
        description:
          "We measure deviation over 24–48 hours against an NTP reference. A pretty dial is nice; a correct one matters.",
      },
      {
        icon: "droplets",
        title: "Build quality graded in hand",
        description:
          "Case finishing, bracelet feel, crown action, and lume are all rated. Spec sheets only tell half the story.",
      },
    ],
  },
  newsletter: {
    title: "Get the best watch deals, weekly",
    subtitle:
      "One email. No spam. The best price drops, new releases, and buying guides under $500.",
    buttonLabel: "Subscribe",
    placeholder: "you@example.com",
    disclaimer: "By subscribing you agree to our Privacy Policy and affiliate disclosure.",
    successMessage: "You’re in — check your inbox for a confirmation.",
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

export function mergeWithDefault(input: unknown): DialHomepageConfig {
  const source = isObject(input) ? input : {};
  const watchesRaw = source.watches;
  const parsedWatches = Array.isArray(watchesRaw)
    ? watchesRaw.map(coerceWatch).filter((w): w is Watch => w !== null)
    : [];
  const watches = parsedWatches.length > 0 ? parsedWatches : defaultDialConfig.watches;

  const priceTiersRaw = source.priceTiers;
  const priceTiers = Array.isArray(priceTiersRaw)
    ? priceTiersRaw
        .map((t: unknown): DialPriceTier | null => {
          if (!isObject(t)) return null;
          const id = t.id;
          const label = t.label;
          const tagline = t.tagline;
          return isWatchTier(id) && isString(label) && isString(tagline)
            ? { id, label, tagline, count: watches.filter((w) => w.tier === id).length }
            : null;
        })
        .filter((t): t is DialPriceTier => t !== null)
    : defaultDialConfig.priceTiers.map((t) => ({
        ...t,
        count: watches.filter((w) => w.tier === t.id).length,
      }));

  const hero = isObject(source.hero)
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
        heroImage: isString(source.hero.heroImage)
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

  const navLinks = Array.isArray(source.navLinks)
    ? source.navLinks
        .map((l: unknown): DialNavLink | null => {
          if (!isObject(l)) return null;
          const label = l.label;
          const href = l.href;
          return isString(label) && isString(href) ? { label, href } : null;
        })
        .filter((l): l is DialNavLink => l !== null)
    : defaultDialConfig.navLinks;

  const trustBar = isObject(source.trustBar)
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
                  ["checkCircle", "calendar", "ruler", "droplets"].includes(icon) &&
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
    return defaultDialConfig;
  }

  try {
    const parsed = JSON.parse(page.body) as unknown;
    return mergeWithDefault(parsed);
  } catch {
    return defaultDialConfig;
  }
}
