/**
 * Central affiliate-link configuration for the CompareAI Etsy AI/POD tenant.
 *
 * Replace the official URLs below with your real affiliate links once approved
 * by EverBee, Alura, and Kittl. The rest of the site reads from this file,
 * so there is only one place to update.
 *
 * No paid or referral URLs are committed here until affiliate approvals are
 * confirmed. These are the public, official landing pages.
 */
export const ETSY_AFFILIATE_LINKS: Record<string, string> = {
  everbee: "https://everbee.io",
  alura: "https://www.alura.io",
  kittl: "https://www.kittl.com",
  canva: "https://www.canva.com",
};

export function getEtsyAffiliateUrl(slug: string): string {
  return ETSY_AFFILIATE_LINKS[slug] ?? "#";
}
