/**
 * Official product data for the Etsy AI/POD tool comparison/review pages.
 *
 * Prices, features and URLs are sourced from each provider's public site and
 * affiliate info pages. `lastVerified` and `officialSources` are kept explicit so
 * claims can be traced back and refreshed.
 */

export interface EtsyToolPlan {
  name: string;
  monthlyUsd: number | null;
  annualUsd: number | null;
  annualTotalUsd: number | null;
  features: string[];
}

export interface EtsyTool {
  slug: string;
  name: string;
  tagline: string;
  websiteUrl: string;
  pricing: EtsyToolPlan[];
  bestFor: string[];
  keyFeatures: string[];
  pros: string[];
  cons: string[];
  officialSources: { label: string; url: string }[];
  lastVerified: string;
}

export const etsyTools: Record<string, EtsyTool> = {
  everbee: {
    slug: "everbee",
    name: "EverBee",
    tagline: "Etsy product research, analytics and keyword research inside a Chrome extension.",
    websiteUrl: "https://everbee.io/",
    pricing: [
      {
        name: "Hobby",
        monthlyUsd: 0,
        annualUsd: 0,
        annualTotalUsd: 0,
        features: [
          "Limited product analytics (views, reviews, favorites)",
          "10 keyword research lookups",
          "Tag analyzer",
          "500 email subscribers",
        ],
      },
      {
        name: "Growth",
        monthlyUsd: 29.99,
        annualUsd: 19.99,
        annualTotalUsd: 239,
        features: [
          "Unlimited keyword research with Keyword Score",
          "Trends & growth rate on individual listings",
          "3 hot filters + advanced filters",
          "1,000 keywords / 100 shops / 10 custom folders",
          "Unlimited store connections",
          "Priority chat and email support",
        ],
      },
      {
        name: "Business",
        monthlyUsd: 99,
        annualUsd: 69,
        annualTotalUsd: 828,
        features: [
          "Everything in Growth",
          "Unlimited favorites and custom filters",
          "Trend patterns over 3, 6, 12, 24 months",
          "Unlimited stores and priority support",
        ],
      },
    ],
    bestFor: [
      "Sellers who want product analytics inside Etsy",
      "Finding high-revenue listings and trending keywords",
      "Validating demand before designing",
    ],
    keyFeatures: [
      "Chrome extension product analytics",
      "Keyword research with demand scores",
      "Tag analyzer and competitor favorites",
      "Trend and growth-rate graphs",
    ],
    pros: [
      "Strong product analytics and revenue estimates",
      "180-day affiliate cookie (official affiliate page)",
      "Hobby plan is free forever",
    ],
    cons: [
      "Paid plans start higher than Alura",
      "Monthly Growth plan is $29.99 vs Alura Growth at $14.99",
      "Advanced filters locked to paid tiers",
    ],
    officialSources: [
      { label: "EverBee Research Pricing", url: "https://everbee.io/pricing/" },
      { label: "EverBee Affiliate Program", url: "https://everbee.io/affiliates/" },
      {
        label: "EverBee Affiliate Help Docs",
        url: "https://help.everbee.io/en/collection/7-everbee-affiliate",
      },
    ],
    lastVerified: "2026-07-18",
  },
  alura: {
    slug: "alura",
    name: "Alura",
    tagline: "All-in-one Etsy research, listing optimization and automation suite.",
    websiteUrl: "https://www.alura.io/",
    pricing: [
      {
        name: "Free",
        monthlyUsd: 0,
        annualUsd: 0,
        annualTotalUsd: 0,
        features: [
          "5 daily searches per tool",
          "Optimize 10 listings",
          "Limited research database",
          "Profit calculator",
          "Alura Chrome extension",
        ],
      },
      {
        name: "Basic",
        monthlyUsd: 9.99,
        annualUsd: 7.99,
        annualTotalUsd: 95.88,
        features: [
          "50 daily searches per tool",
          "Optimize up to 100 listings",
          "Save items to lists and folders",
          "100 AI responses per month",
          "50 customer follow-ups per month",
          "Priority support",
        ],
      },
      {
        name: "Growth",
        monthlyUsd: 29.99,
        annualUsd: 14.99,
        annualTotalUsd: 179.88,
        features: [
          "10x+ usage of every tool",
          "Advanced data and filters",
          "Full research database",
          "Pinterest marketing (15/day)",
          "4 active A/B tests",
          "Limited analytics suite",
          "Etsy Ads optimization",
        ],
      },
      {
        name: "Professional",
        monthlyUsd: 69.99,
        annualUsd: 29.99,
        annualTotalUsd: 359.88,
        features: [
          "Unlimited usage of every tool",
          "Connect multiple shops",
          "CSV data export",
          "Pinterest marketing (40/day)",
          "20 active A/B tests",
          "Full analytics suite",
          "Email marketing add-on",
          "Alura Labs beta access",
        ],
      },
    ],
    bestFor: [
      "Sellers who want one tool for research + listing optimization",
      "Automating customer follow-ups and Etsy Ads",
      "Beginners who need a cheap entry point",
    ],
    keyFeatures: [
      "Keyword, product and shop research",
      "Listing optimization and A/B tests",
      "AI-generated titles, tags and responses",
      "Customer follow-up automation",
    ],
    pros: [
      "Lower paid starting price ($7.99/mo annual Basic)",
      "Strong listing optimization workflow",
      "Built-in customer follow-ups and AI copy",
    ],
    cons: [
      "Product analytics are less visual than EverBee",
      "30-day affiliate cookie (official affiliate page)",
      "Unlimited usage only on Professional",
    ],
    officialSources: [
      { label: "Alura Pricing", url: "https://www.alura.io/pricing" },
      { label: "Alura Affiliate Program", url: "https://www.alura.io/affiliate" },
      { label: "Alura Plans Feature Table", url: "https://www.alura.io/pricing" },
    ],
    lastVerified: "2026-07-18",
  },
  kittl: {
    slug: "kittl",
    name: "Kittl",
    tagline:
      "AI-first design platform built for typography, vector graphics, POD mockups and merchandise.",
    websiteUrl: "https://www.kittl.com/",
    pricing: [
      {
        name: "Free",
        monthlyUsd: 0,
        annualUsd: 0,
        annualTotalUsd: 0,
        features: [
          "5 projects",
          "200 one-time AI tokens",
          "Curated templates and fonts",
          "Exports limited to 800px / 72 DPI",
          "No commercial license",
        ],
      },
      {
        name: "Pro",
        monthlyUsd: 19,
        annualUsd: 14,
        annualTotalUsd: 168,
        features: [
          "Unlimited projects",
          "30 AI credits per day",
          "2,000 AI tokens per month",
          "10GB file storage",
          "Full commercial license",
          "Vector downloads",
        ],
      },
      {
        name: "Expert",
        monthlyUsd: 45,
        annualUsd: 34,
        annualTotalUsd: 408,
        features: [
          "Everything in Pro",
          "80 AI credits per day",
          "6,000 AI tokens per month",
          "100GB file storage",
          "Priority rendering",
          "Advanced templates and mockups",
        ],
      },
    ],
    bestFor: [
      "Typography-heavy POD designs",
      "Creating vector designs, logos and labels",
      "Etsy sellers who want built-in mockups",
    ],
    keyFeatures: [
      "AI image and vector generator",
      "Typography effects and text layouts",
      "POD mockups and templates",
      "Vector exports and commercial license",
    ],
    pros: [
      "Built for print-ready typography and vector work",
      "Strong mockup library for POD",
      "20% recurring affiliate commission for 12 months (official)",
    ],
    cons: [
      "AI tokens do not roll over month to month",
      "Less general-purpose than Canva",
      "Monthly Pro is $19; Canva Pro is often cheaper",
    ],
    officialSources: [
      { label: "Kittl Homepage Pricing", url: "https://www.kittl.com/" },
      { label: "Kittl Affiliate Program", url: "https://www.kittl.com/partners/affiliates" },
      { label: "Kittl Pricing Page", url: "https://www.kittl.com/pricing" },
    ],
    lastVerified: "2026-07-18",
  },
  canva: {
    slug: "canva",
    name: "Canva",
    tagline: "General-purpose design tool with AI features, templates and a huge stock library.",
    websiteUrl: "https://www.canva.com/",
    pricing: [
      {
        name: "Free",
        monthlyUsd: 0,
        annualUsd: 0,
        annualTotalUsd: 0,
        features: [
          "Drag-and-drop editor",
          "1,000+ design types and 1.6M+ templates",
          "1 Brand Kit (3 colours only)",
          "5GB cloud storage",
          "Limited AI uses",
        ],
      },
      {
        name: "Pro",
        monthlyUsd: 12.99,
        annualUsd: 9.99,
        annualTotalUsd: 119.99,
        features: [
          "Premium tools (resize, background remover, translate)",
          "3.6M+ templates and 141M+ stock assets",
          "5 Brand Kits",
          "100GB cloud storage",
          "Social content scheduling",
          "10x more AI than Free",
        ],
      },
      {
        name: "Business",
        monthlyUsd: 20.99,
        annualUsd: 16.99,
        annualTotalUsd: 203.88,
        features: [
          "Everything in Pro",
          "Team collaboration and admin tools",
          "100 Brand Kits",
          "500GB cloud storage",
          "20x more AI than Free",
        ],
      },
    ],
    bestFor: [
      "Sellers who want one tool for many design types",
      "Social posts, Pinterest pins and flyers",
      "Teams or sellers who also do marketing graphics",
    ],
    keyFeatures: [
      "Huge template and stock library",
      "AI image generator, Magic Eraser and background remover",
      "Brand Kits and social scheduler",
      "Easy drag-and-drop editor",
    ],
    pros: [
      "Massive template and asset library",
      "Lower effective cost than Kittl for Pro users",
      "Great for non-designers and marketing assets",
    ],
    cons: [
      "Vector and typography tools are weaker than Kittl",
      "POD mockups are more limited",
      "AI allowance is shared and can run out fast",
    ],
    officialSources: [
      { label: "Canva Pricing", url: "https://www.canva.com/pricing/" },
      {
        label: "Canva Help - Subscription Options",
        url: "https://www.canva.com/help/subscription-options/",
      },
    ],
    lastVerified: "2026-07-18",
  },
};

export function getEtsyTool(slug: string): EtsyTool | undefined {
  return etsyTools[slug];
}

export interface EtsyComparison {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  leftToolSlug: string;
  rightToolSlug: string;
  verdictHeadline: string;
  verdictBody: string;
  faq: { question: string; answer: string }[];
  datePublished: string;
  dateModified: string;
}

export const etsyComparisons: Record<string, EtsyComparison> = {
  "alura-vs-everbee": {
    slug: "alura-vs-everbee",
    title: "EverBee vs Alura (2026): Which Etsy Tool Wins?",
    metaTitle: "EverBee vs Alura (2026): Best Etsy Research & SEO Tool",
    metaDescription:
      "Honest EverBee vs Alura comparison for 2026. We compare pricing, keyword research, product analytics, listing optimization and affiliate terms so you can pick the right Etsy tool.",
    primaryKeyword: "everbee vs alura",
    leftToolSlug: "everbee",
    rightToolSlug: "alura",
    verdictHeadline:
      "Alura Growth is the better value for most sellers under 150 listings; EverBee wins for analytics-first research.",
    verdictBody:
      "If your main problem is picking what to sell, EverBee's Chrome extension analytics and revenue estimates are the cleanest signal. If your main problem is optimizing listings and automating follow-ups, Alura's all-in-one suite does more for less money.",
    faq: [
      {
        question: "Is EverBee or Alura better for beginners?",
        answer:
          "Alura is usually better for beginners because it has a free plan and its paid plans start at $7.99 per month when billed annually. EverBee's Growth plan starts at $19.99 per month annually, which is more useful after you already know you need deep analytics.",
      },
      {
        question: "Which tool has better Etsy keyword research?",
        answer:
          "EverBee's keyword research is built around live Etsy listings and shows demand scores inside the Chrome extension. Alura adds autocomplete enrichment, trending keywords and listing-optimization scoring. Both are useful; EverBee is stronger for demand validation, Alura is stronger for writing titles and tags.",
      },
      {
        question: "Can I use EverBee and Alura together?",
        answer:
          "Yes. Many sellers use EverBee to find winning product ideas, then use Alura to optimize titles, tags and customer follow-ups. Just make sure each tool pays for itself before you keep both.",
      },
    ],
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
  },
  "canva-for-etsy-pod-vs-kittl": {
    slug: "canva-for-etsy-pod-vs-kittl",
    title: "Kittl vs Canva for Etsy POD (2026): Design Tool Showdown",
    metaTitle: "Kittl vs Canva for Etsy POD (2026): Best Design Tool",
    metaDescription:
      "Compare Kittl and Canva for print-on-demand and digital-product designs. Typography, mockups, AI credits, commercial licensing and pricing — with official sources.",
    primaryKeyword: "kittl vs canva for etsy pod",
    leftToolSlug: "kittl",
    rightToolSlug: "canva",
    verdictHeadline:
      "Kittl is the stronger POD design tool; Canva is the better all-rounder for marketing graphics.",
    verdictBody:
      "For typography-heavy t-shirt and merchandise designs, Kittl's vector tools, text effects and POD mockups are purpose-built. Canva is cheaper and has more templates, but its vector and typography controls are weaker and its mockup library is more limited.",
    faq: [
      {
        question: "Can I use Kittl designs commercially on Etsy?",
        answer:
          "Kittl Pro and Expert plans include a commercial license. The free plan is for personal use only, so you need a paid plan to sell Kittl designs on Etsy.",
      },
      {
        question: "Is Canva Pro enough for Etsy POD?",
        answer:
          "Canva Pro is enough for many sellers who want social graphics, simple designs and access to stock assets. For complex typography, vector exports or detailed POD mockups, Kittl is usually faster.",
      },
      {
        question: "Which has better AI credits for sellers?",
        answer:
          "Kittl Pro gives 2,000 AI tokens per month and 30 AI credits per day according to the public pricing page. Canva Pro gives a shared AI allowance that is 10x the free plan. If AI generation is central to your workflow, compare actual token usage before choosing.",
      },
    ],
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
  },
};

export function getEtsyComparison(slug: string): EtsyComparison | undefined {
  return etsyComparisons[slug];
}

export function getAllEtsyComparisonSlugs(): string[] {
  return Object.keys(etsyComparisons);
}

export interface EtsyReview {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  primaryKeyword: string;
  toolSlug: string;
  verdictHeadline: string;
  verdictBody: string;
  breakEvenAssumptions: {
    pricePerUnit: number;
    productionCost: number;
    monthlyOverhead: number;
    etsyFeesPercent: number;
    note: string;
  };
  faq: { question: string; answer: string }[];
  datePublished: string;
  dateModified: string;
}

export const etsyReviews: Record<string, EtsyReview> = {
  "is-everbee-worth-it-for-new-shop": {
    slug: "is-everbee-worth-it-for-new-shop",
    title: "Is EverBee Worth It for a New Etsy Shop? (2026)",
    metaTitle: "Is EverBee Worth It for a New Etsy Shop? (2026 Review)",
    metaDescription:
      "Honest EverBee review for new Etsy sellers. We break down pricing, break-even units, and whether the Growth plan makes sense before you have sales.",
    primaryKeyword: "is everbee worth it for a new shop",
    toolSlug: "everbee",
    verdictHeadline:
      "EverBee's free Hobby plan is worth using immediately; the Growth plan only pays for itself once you are listing consistently.",
    verdictBody:
      "For a brand new shop, start with EverBee's free Hobby plan to validate demand and find your first 5-10 product ideas. Upgrade to Growth when you are publishing at least a few listings per week and need unlimited keyword research and competitor analytics.",
    breakEvenAssumptions: {
      pricePerUnit: 22,
      productionCost: 8,
      monthlyOverhead: 30,
      etsyFeesPercent: 15,
      note: "Assumes a $22 POD t-shirt, $8 production cost, and ~15% Etsy fees and payment processing. Use the calculator to enter your exact numbers.",
    },
    faq: [
      {
        question: "Does EverBee have a free plan?",
        answer:
          "Yes. EverBee Hobby is free forever and includes limited product analytics, the tag analyzer and 10 keyword research lookups. No credit card is required.",
      },
      {
        question: "How much is EverBee per month?",
        answer:
          "Growth is $29.99 per month or $19.99 per month when billed annually ($239/year). Business is $99 per month or $69 per month when billed annually ($828/year).",
      },
      {
        question: "Can EverBee guarantee Etsy sales?",
        answer:
          "No. EverBee shows demand signals and competitor data, but sales depend on your design, niche, pricing, mockups, reviews and marketing. We never promise guaranteed income.",
      },
    ],
    datePublished: "2026-07-18",
    dateModified: "2026-07-18",
  },
};

export function getEtsyReview(slug: string): EtsyReview | undefined {
  return etsyReviews[slug];
}

export function getAllEtsyReviewSlugs(): string[] {
  return Object.keys(etsyReviews);
}

export function formatCurrencyUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
