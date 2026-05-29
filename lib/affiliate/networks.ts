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
