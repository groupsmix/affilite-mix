import { hasUsableAffiliateUrl } from "./affiliate-url";

interface DialAffiliateWatch {
  brand: string;
  name: string;
  affiliateUrl: string;
}

const AMAZON_TAG = process.env.AMAZON_ASSOCIATE_TAG || process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG;

function hasAmazonReferral(url: string): boolean {
  try {
    const u = new URL(url);
    return u.searchParams.has("tag") || u.searchParams.has("ref");
  } catch {
    return false;
  }
}

function getAmazonSearchUrl(brand: string, name: string): string {
  const query = `${brand} ${name}`.replace(/\s+/g, " ").trim();
  let url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`;
  if (AMAZON_TAG) {
    url += `&tag=${encodeURIComponent(AMAZON_TAG)}`;
  }
  return url;
}

function appendAmazonTag(url: string): string {
  if (!AMAZON_TAG || !url.includes("amazon.com")) return url;
  try {
    const u = new URL(url);
    if (u.searchParams.has("tag")) return url;
    u.searchParams.set("tag", AMAZON_TAG);
    return u.toString();
  } catch {
    return url;
  }
}

export function resolveDialAffiliateUrl(watch: DialAffiliateWatch): string {
  if (hasUsableAffiliateUrl(watch.affiliateUrl)) {
    const isAmazon = watch.affiliateUrl.includes("amazon.com");
    if (isAmazon && !AMAZON_TAG && !hasAmazonReferral(watch.affiliateUrl)) return "";
    return appendAmazonTag(watch.affiliateUrl);
  }
  if (AMAZON_TAG) {
    return getAmazonSearchUrl(watch.brand, watch.name);
  }
  return "";
}
