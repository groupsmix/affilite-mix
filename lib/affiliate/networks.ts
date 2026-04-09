/**
 * Affiliate network integrations — CJ Affiliate, PartnerStack, Admitad.
 *
 * Each network adapter provides methods to:
 * - Build affiliate links with tracking parameters
 * - Validate link format
 * - Get network metadata
 */

export type AffiliateNetwork = "cj" | "partnerstack" | "admitad" | "direct";

export interface AffiliateNetworkConfig {
  network: AffiliateNetwork;
  name: string;
  description: string;
  bestFor: string;
  baseUrl: string;
  requiresApiKey: boolean;
  envKeyName: string;
}

export const NETWORK_CONFIGS: Record<AffiliateNetwork, AffiliateNetworkConfig> = {
  cj: {
    network: "cj",
    name: "CJ Affiliate",
    description: "Commission Junction — one of the largest affiliate networks",
    bestFor: "Watches, general products, established brands",
    baseUrl: "https://www.anrdoezrs.net/links/",
    requiresApiKey: true,
    envKeyName: "CJ_API_KEY",
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

export interface AffiliateLinkParams {
  network: AffiliateNetwork;
  merchantUrl: string;
  publisherId?: string;
  campaignId?: string;
  subId?: string;
  siteId?: string;
}

/**
 * Build a tracked affiliate link with proper attribution parameters.
 */
export function buildAffiliateLink(params: AffiliateLinkParams): string {
  const { network, merchantUrl, publisherId, campaignId, subId, siteId } = params;

  switch (network) {
    case "cj": {
      const pid = publisherId ?? process.env.CJ_PUBLISHER_ID ?? "";
      const url = new URL(merchantUrl);
      url.searchParams.set("sid", [siteId, subId, campaignId].filter(Boolean).join("-"));
      // CJ deep links use the format: https://www.anrdoezrs.net/links/{pid}/type/dlg/{merchant_url}
      return `https://www.anrdoezrs.net/links/${pid}/type/dlg/${encodeURIComponent(url.toString())}`;
    }

    case "partnerstack": {
      const url = new URL(merchantUrl);
      if (publisherId) url.searchParams.set("ps_partner_key", publisherId);
      if (campaignId) url.searchParams.set("ps_campaign", campaignId);
      if (subId) url.searchParams.set("ps_xid", subId);
      if (siteId) url.searchParams.set("ps_site", siteId);
      return url.toString();
    }

    case "admitad": {
      const pid = publisherId ?? process.env.ADMITAD_PUBLISHER_ID ?? "";
      // Admitad deep links: https://ad.admitad.com/g/{pid}/?ulp={encoded_url}
      const trackingUrl = new URL(`https://ad.admitad.com/g/${pid}/`);
      trackingUrl.searchParams.set("ulp", merchantUrl);
      if (subId) trackingUrl.searchParams.set("subid", subId);
      if (siteId) trackingUrl.searchParams.set("subid2", siteId);
      if (campaignId) trackingUrl.searchParams.set("subid3", campaignId);
      return trackingUrl.toString();
    }

    case "direct":
    default: {
      const url = new URL(merchantUrl);
      if (subId) url.searchParams.set("ref", subId);
      if (siteId) url.searchParams.set("site", siteId);
      return url.toString();
    }
  }
}

/**
 * Get all configured networks (those with API keys set).
 */
export function getConfiguredNetworks(): AffiliateNetworkConfig[] {
  return Object.values(NETWORK_CONFIGS).filter((cfg) => {
    if (!cfg.requiresApiKey) return true;
    return Boolean(process.env[cfg.envKeyName]);
  });
}

/**
 * Get suggested network for a given site niche.
 */
export function getSuggestedNetwork(siteId: string): AffiliateNetwork {
  const nicheMap: Record<string, AffiliateNetwork> = {
    "watch-tools": "cj",
    "crypto-tools": "cj",
    "ai-compared": "partnerstack",
    "arabic-tools": "admitad",
  };
  return nicheMap[siteId] ?? "direct";
}
