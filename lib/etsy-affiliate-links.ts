/**
 * Central affiliate-link config for the Etsy AI/POD tenant.
 *
 * Drop real affiliate URLs here once approved. When a URL is null, the public
 * CTA falls back to the provider's official website URL.
 */

import { getEtsyTool } from "./etsy-product-data";

export const ETSY_AFFILIATE_LINKS: Record<string, string | null> = {
  everbee: null,
  alura: null,
  kittl: null,
  canva: null,
  printful: null,
};

export function getAffiliateLink(toolSlug: string): string | null {
  return ETSY_AFFILIATE_LINKS[toolSlug] ?? null;
}

export function getProductUrl(toolSlug: string): string {
  const affiliate = getAffiliateLink(toolSlug);
  if (affiliate) return affiliate;

  const tool = getEtsyTool(toolSlug);
  if (tool) return tool.websiteUrl;

  return "#";
}

export function isAffiliateLinkReady(toolSlug: string): boolean {
  return (
    typeof ETSY_AFFILIATE_LINKS[toolSlug] === "string" && ETSY_AFFILIATE_LINKS[toolSlug]!.length > 0
  );
}
