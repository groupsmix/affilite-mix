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
  /**
   * Query parameter this network uses for publisher tracking keys.
   * When set and a site tracking key is configured, the shortcode redirect
   * appends this parameter to the outbound affiliate URL.
   */
  trackingParam?: string;
  /**
   * Hostnames (and their subdomains) that identify this network.
   * Used to infer the network from a raw affiliate URL.
   */
  domains?: string[];
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
    trackingParam: "tag",
    domains: ["amazon.com", "amzn.to", "amzn.com"],
  },
  cj: {
    network: "cj",
    name: "CJ Affiliate",
    description: "Commission Junction — one of the largest affiliate networks",
    bestFor: "Watches, general products, established brands",
    baseUrl: "https://www.anrdoezrs.net/links/",
    requiresApiKey: true,
    envKeyName: "CJ_API_KEY",
    trackingParam: "sid",
    domains: ["anrdoezrs.net", "dpbolvw.net", "jdoqocy.com", "kqzyfj.com", "tkqlhce.com"],
  },
  shareasale: {
    network: "shareasale",
    name: "ShareASale",
    description: "Large network (now part of Awin) with many niche merchants",
    bestFor: "Watches, boutique brands, fashion, D2C merchants",
    baseUrl: "https://www.shareasale.com/",
    requiresApiKey: false,
    envKeyName: "",
    trackingParam: "afftrack",
    domains: ["shareasale.com", "shareasale-analytics.com"],
  },
  awin: {
    network: "awin",
    name: "Awin",
    description: "Global affiliate network with strong EU/UK merchant coverage",
    bestFor: "International brands, watches, fashion, retail",
    baseUrl: "https://www.awin1.com/",
    requiresApiKey: false,
    envKeyName: "",
    trackingParam: "clickref",
    domains: ["awin1.com", "awin.com"],
  },
  rakuten: {
    network: "rakuten",
    name: "Rakuten Advertising",
    description: "Rakuten/LinkShare — premium brand advertisers",
    bestFor: "Established retail brands, watches, department stores",
    baseUrl: "https://click.linksynergy.com/",
    requiresApiKey: false,
    envKeyName: "",
    trackingParam: "u1",
    domains: ["linksynergy.com", "link.synergy.net", "rakuten.com"],
  },
  impact: {
    network: "impact",
    name: "Impact",
    description: "Impact.com — partnership platform used by many major brands",
    bestFor: "Direct brand programs, watches, DTC, SaaS",
    baseUrl: "https://impact.com/",
    requiresApiKey: false,
    envKeyName: "",
    trackingParam: "subId1",
    domains: ["impact.com"],
  },
  ebay: {
    network: "ebay",
    name: "eBay Partner Network",
    description: "eBay's affiliate program — new and pre-owned inventory",
    bestFor: "Pre-owned/vintage watches, deals, auctions",
    baseUrl: "https://rover.ebay.com/",
    requiresApiKey: false,
    envKeyName: "",
    trackingParam: "customid",
    domains: ["rover.ebay.com", "ebay.com", "ebay.de", "ebay.co.uk"],
  },
  walmart: {
    network: "walmart",
    name: "Walmart Affiliates",
    description: "Walmart's affiliate program — broad US retail catalog",
    bestFor: "Budget watches, general US retail products",
    baseUrl: "https://www.walmart.com/",
    requiresApiKey: false,
    envKeyName: "",
    domains: ["walmart.com", "affil.walmart.com"],
  },
  target: {
    network: "target",
    name: "Target Affiliates",
    description: "Target's affiliate program (via Impact) — US retail",
    bestFor: "Budget/mid-range watches, general US retail",
    baseUrl: "https://www.target.com/",
    requiresApiKey: false,
    envKeyName: "",
    domains: ["target.com"],
  },
  clickbank: {
    network: "clickbank",
    name: "ClickBank",
    description: "Digital-products marketplace with high commissions",
    bestFor: "Digital products, courses, info products",
    baseUrl: "https://hop.clickbank.net/",
    requiresApiKey: false,
    envKeyName: "",
    domains: ["clickbank.com", "hop.clickbank.net"],
  },
  partnerstack: {
    network: "partnerstack",
    name: "PartnerStack",
    description: "B2B SaaS affiliate network — ideal for AI and software tools",
    bestFor: "AI tools, SaaS products, software reviews",
    baseUrl: "https://partnerstack.com/",
    requiresApiKey: true,
    envKeyName: "PARTNERSTACK_API_KEY",
    domains: ["partnerstack.com"],
  },
  admitad: {
    network: "admitad",
    name: "Admitad",
    description: "Global affiliate network with strong MENA presence",
    bestFor: "Arabic/MENA market, international brands",
    baseUrl: "https://www.admitad.com/",
    requiresApiKey: true,
    envKeyName: "ADMITAD_API_KEY",
    trackingParam: "subid",
    domains: ["admitad.com", "admitad.global"],
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

function matchesNetworkDomain(hostname: string, domain: string): boolean {
  const d = domain.toLowerCase().replace(/^www\./, "");
  const h = hostname.toLowerCase().replace(/^www\./, "");
  return h === d || h.endsWith(`.${d}`);
}

function networkFromHostname(hostname: string): AffiliateNetwork | null {
  for (const [network, config] of Object.entries(NETWORK_CONFIGS) as [
    AffiliateNetwork,
    AffiliateNetworkConfig,
  ][]) {
    if (config.domains) {
      for (const domain of config.domains) {
        if (matchesNetworkDomain(hostname, domain)) return network;
      }
    }
    if (config.baseUrl) {
      try {
        const baseHost = new URL(config.baseUrl).hostname;
        if (matchesNetworkDomain(hostname, baseHost)) return network;
      } catch {
        // malformed baseUrl; skip
      }
    }
  }
  return null;
}

/** Infer the affiliate network from an outbound URL's hostname. */
export function getNetworkFromUrl(url: string): AffiliateNetwork | null {
  try {
    const hostname = new URL(url).hostname;
    return networkFromHostname(hostname);
  } catch {
    return null;
  }
}

/** Return the tracking-key query parameter this network expects, if any. */
export function getTrackingParamForNetwork(network: AffiliateNetwork): string | null {
  return NETWORK_CONFIGS[network]?.trackingParam ?? null;
}

/** Validate a raw network string and narrow it to the typed union. */
export function toAffiliateNetwork(value: string): AffiliateNetwork | null {
  if (value in NETWORK_CONFIGS) return value as AffiliateNetwork;
  return null;
}
