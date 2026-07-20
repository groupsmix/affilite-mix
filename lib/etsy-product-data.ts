/**
 * Public product data for the CompareAI Etsy AI/POD tenant.
 *
 * Prices and features are sourced from each vendor's official pricing/features
 * pages as of July 2026 and are labeled as "reported" or "official" in the
 * sources. These are for side-by-side comparison and buyer context, not
 * firsthand testing claims.
 */

export interface EtsyTool {
  slug: string;
  name: string;
  tagline: string;
  officialUrl: string;
  bestFor: string;
  freePlan: string;
  paidPlans: {
    name: string;
    monthly: number | null;
    annual: number | null;
    note?: string;
  }[];
  keyFeatures: string[];
  limitations: string[];
  sources: { label: string; url: string }[];
}

export const etsyTools: Record<string, EtsyTool> = {
  everbee: {
    slug: "everbee",
    name: "EverBee",
    tagline: "Etsy product research, keyword data, and email tools for Etsy sellers.",
    officialUrl: "https://everbee.io",
    bestFor:
      "Sellers who want sales estimates, keyword research, and competitor analytics inside Etsy.",
    freePlan:
      "Hobby plan: limited keyword results, product analytics views, and favorites. No credit card required.",
    paidPlans: [
      { name: "Growth", monthly: 19.99, annual: 239.0, note: "Billed at $239/year" },
      { name: "Business", monthly: 69.0, annual: 828.0, note: "Billed at $828/year" },
    ],
    keyFeatures: [
      "Product analytics (views, reviews, favorites, sales estimates)",
      "Unlimited keyword research with keyword score",
      "Tag analyzer",
      "Trends and growth-rate tables",
      "Unlimited Etsy store connections on Business",
      "EverBee Email with subscriber and campaign tools",
    ],
    limitations: [
      "Free plan caps keyword results and favorites",
      "Email subscriber limits on lower tiers",
      "Sales estimates are modeled, not confirmed Etsy data",
    ],
    sources: [
      { label: "EverBee pricing page", url: "https://everbee.io/pricing-optimize-test/" },
      {
        label: "EverBee plans help doc",
        url: "https://help.everbee.io/en/article/32-what-plans-does-everbee-offers",
      },
    ],
  },

  alura: {
    slug: "alura",
    name: "Alura",
    tagline: "Etsy SEO, keyword research, listing optimization, and automation.",
    officialUrl: "https://www.alura.io",
    bestFor:
      "Sellers who want to optimize titles/tags, run A/B tests, and automate Etsy SEO workflows.",
    freePlan:
      "Free plan: up to 5 daily searches/tool, optimize 10 listings, limited research databases.",
    paidPlans: [
      {
        name: "Basic",
        monthly: 9.99,
        annual: 95.88,
        note: "$7.99/mo billed annually; $9.99/mo billed monthly",
      },
      {
        name: "Growth",
        monthly: 29.99,
        annual: 179.88,
        note: "$14.99/mo billed annually; $29.99/mo billed monthly",
      },
      {
        name: "Professional",
        monthly: 69.99,
        annual: 359.88,
        note: "$29.99/mo billed annually; $69.99/mo billed monthly",
      },
    ],
    keyFeatures: [
      "Etsy keyword and product research",
      "Listing optimizer and title/tag suggestions",
      "A/B tests for pricing and photos",
      "Pinterest marketing scheduler",
      "Email marketing add-on",
      "CSV export and multi-shop support on higher tiers",
    ],
    limitations: [
      "Free plan has tight daily search limits",
      "Full Pinterest/email marketing only on paid tiers",
      "Some advanced analytics limited to Professional",
    ],
    sources: [
      { label: "Alura pricing page", url: "https://www.alura.io/pricing" },
      { label: "Alura llms.txt pricing overview", url: "https://www.alura.io/llms.txt" },
    ],
  },

  kittl: {
    slug: "kittl",
    name: "Kittl",
    tagline: "AI-first design platform with vector editing, templates, and mockups.",
    officialUrl: "https://www.kittl.com",
    bestFor:
      "POD sellers who need vector designs, AI generation, mockups, and commercial-use assets.",
    freePlan:
      "Free plan: 200 AI tokens (one-time), basic templates, limited projects and export formats.",
    paidPlans: [
      {
        name: "Pro",
        monthly: 15.0,
        annual: 120.0,
        note: "$10/mo billed annually; $15/mo billed monthly",
      },
      {
        name: "Expert",
        monthly: 30.0,
        annual: 288.0,
        note: "$24/mo billed annually; $30/mo billed monthly",
      },
      { name: "Business", monthly: null, annual: null, note: "Custom/team pricing" },
    ],
    keyFeatures: [
      "AI image and vector generation",
      "POD templates and mockups",
      "Vector editor with real-time collaboration",
      "Premium fonts, illustrations, and photos",
      "Commercial license on paid plans",
      "SVG, PNG, PDF, and JPEG export",
    ],
    limitations: [
      "Free AI tokens are one-time, not monthly",
      "Free plan limits projects and export formats",
      "Business plan is quote-based for teams",
    ],
    sources: [
      { label: "Kittl homepage pricing", url: "https://kittl.com/" },
      {
        label: "Kittl pricing guide (Propicked)",
        url: "https://propicked.com/ai-tools/kittl/pricing",
      },
    ],
  },

  canva: {
    slug: "canva",
    name: "Canva",
    tagline: "General-purpose design platform with templates, AI, and print options.",
    officialUrl: "https://www.canva.com",
    bestFor:
      "Sellers who already use Canva for social graphics, presentations, and simple mockups.",
    freePlan: "Canva Free: core design tools, limited templates and AI uses.",
    paidPlans: [
      {
        name: "Pro",
        monthly: 15.0,
        annual: 144.0,
        note: "$144/year per person; monthly rates vary by region",
      },
      {
        name: "Business",
        monthly: 20.0,
        annual: 250.0,
        note: "$20/person/month; $250/year per person annual",
      },
      { name: "Enterprise", monthly: null, annual: null, note: "Custom pricing" },
    ],
    keyFeatures: [
      "Millions of templates, photos, videos, and graphics",
      "Background remover, Magic Resize, and Brand Kit",
      "Canva AI and Magic Media image generation",
      "Social content scheduling",
      "Team collaboration and approvals on Business+",
      "Print-on-demand and print-order discounts",
    ],
    limitations: [
      "Vector/EPS/POD production file workflow is weaker than dedicated tools",
      "AI usage limits apply; AI Pass may be extra",
      "Canva Free is limited for commercial asset libraries",
    ],
    sources: [
      { label: "Canva pricing page", url: "https://www.canva.com/pricing/?tab=main" },
      { label: "Canva pricing analysis (SaaSZap)", url: "https://saaszap.com/canva-pricing/" },
    ],
  },
};

export function getEtsyTool(slug: string): EtsyTool | undefined {
  return etsyTools[slug];
}

export function getAllEtsyToolSlugs(): string[] {
  return Object.keys(etsyTools);
}
