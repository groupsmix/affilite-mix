import { hasUsableAffiliateUrl } from "./affiliate-url";

interface DialAffiliateWatch {
  brand: string;
  name: string;
  affiliateUrl: string;
}

function getAmazonSearchUrl(brand: string, name: string): string {
  const query = `${brand} ${name}`.replace(/\s+/g, " ").trim();
  return `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
}

export function resolveDialAffiliateUrl(watch: DialAffiliateWatch): string {
  return hasUsableAffiliateUrl(watch.affiliateUrl)
    ? watch.affiliateUrl
    : getAmazonSearchUrl(watch.brand, watch.name);
}
