/**
 * Affiliate network catalog.
 *
 * This is a reference + config store, NOT a link rewriter. Product affiliate
 * links are set per-product (the product's affiliate URL) and served through
 * the `/r/[slug]` redirect; configuring a network here does not modify those
 * URLs. `requiresApiKey` marks the networks that additionally support
 * automated commission-report ingestion (the `commission-ingest` cron), which
 * reads the key from the Worker secret named in `envKeyName`.
 *
 * Keep the set of networks aligned with the redirect domain allow-list
 * (`lib/affiliate-domain-allowlist.ts`): a network is only usable if its link
 * domain is allow-listed, so surfacing networks that can never pass the
 * redirect guard would be misleading.
 */

export type AffiliateNetwork =
  | "amazon"
  | "cj"
  | "shareasale"
  | "awin"
  | "rakuten"
  | "impact"
  | "ebay"
  | "walmart"
  | "target"
  | "clickbank"
  | "partnerstack"
  | "admitad"
  | "direct";

export interface AffiliateNetworkConfig {
  network: AffiliateNetwork;
  name: string;
  description: string;
  bestFor: string;
  baseUrl: string;
  /**
   * True only for networks with an automated commission-report integration
   * (the `commission-ingest` cron). When true, the key must be set as a Worker
   * secret named `envKeyName`. False for link-only networks where you paste the
   * network-generated deep link into each product.
   */
  requiresApiKey: boolean;
  envKeyName: string;
}

export const NETWORK_CONFIGS: Record<AffiliateNetwork, AffiliateNetworkConfig> = {
  amazon: {
    network: "amazon",
    name: "Amazon Associates",
    description: "Amazon's affiliate program — largest catalog, high trust",
    bestFor: "Watches, general products, broad consumer catalog",
    baseUrl: "https://www.amazon.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  cj: {
    network: "cj",
    name: "CJ Affiliate",
    description: "Commission Junction — one of the largest affiliate networks",
    bestFor: "Watches, general products, established brands",
    baseUrl: "https://www.anrdoezrs.net/links/",
    requiresApiKey: true,
    envKeyName: "CJ_API_KEY",
  },
  shareasale: {
    network: "shareasale",
    name: "ShareASale",
    description: "Large network (now part of Awin) with many niche merchants",
    bestFor: "Watches, boutique brands, fashion, D2C merchants",
    baseUrl: "https://www.shareasale.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  awin: {
    network: "awin",
    name: "Awin",
    description: "Global affiliate network with strong EU/UK merchant coverage",
    bestFor: "International brands, watches, fashion, retail",
    baseUrl: "https://www.awin1.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  rakuten: {
    network: "rakuten",
    name: "Rakuten Advertising",
    description: "Rakuten/LinkShare — premium brand advertisers",
    bestFor: "Established retail brands, watches, department stores",
    baseUrl: "https://click.linksynergy.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  impact: {
    network: "impact",
    name: "Impact",
    description: "Impact.com — partnership platform used by many major brands",
    bestFor: "Direct brand programs, watches, DTC, SaaS",
    baseUrl: "https://impact.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  ebay: {
    network: "ebay",
    name: "eBay Partner Network",
    description: "eBay's affiliate program — new and pre-owned inventory",
    bestFor: "Pre-owned/vintage watches, deals, auctions",
    baseUrl: "https://rover.ebay.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  walmart: {
    network: "walmart",
    name: "Walmart Affiliates",
    description: "Walmart's affiliate program — broad US retail catalog",
    bestFor: "Budget watches, general US retail products",
    baseUrl: "https://www.walmart.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  target: {
    network: "target",
    name: "Target Affiliates",
    description: "Target's affiliate program (via Impact) — US retail",
    bestFor: "Budget/mid-range watches, general US retail",
    baseUrl: "https://www.target.com/",
    requiresApiKey: false,
    envKeyName: "",
  },
  clickbank: {
    network: "clickbank",
    name: "ClickBank",
    description: "Digital-products marketplace with high commissions",
    bestFor: "Digital products, courses, info products",
    baseUrl: "https://hop.clickbank.net/",
    requiresApiKey: false,
    envKeyName: "",
  },
  partnerstack: {
    network: "partnerstack",
    name: "PartnerStack",
    description: "B2B SaaS affiliate network — ideal for AI and software tools",
    bestFor: "AI tools, SaaS products, software reviews",
    baseUrl: "https://partnerstack.com/",
    requiresApiKey: true,
    envKeyName: "PARTNERSTACK_API_KEY",
  },
  admitad: {
    network: "admitad",
    name: "Admitad",
    description: "Global affiliate network with strong MENA presence",
    bestFor: "Arabic/MENA market, international brands",
    baseUrl: "https://www.admitad.com/",
    requiresApiKey: true,
    envKeyName: "ADMITAD_API_KEY",
  },
  direct: {
    network: "direct",
    name: "Direct",
    description: "Direct affiliate links — no network middleman",
    bestFor: "Custom deals, direct partnerships",
    baseUrl: "",
    requiresApiKey: false,
    envKeyName: "",
  },
};
