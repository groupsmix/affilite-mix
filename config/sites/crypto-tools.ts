import { defineSite } from "../define-site";

export const cryptoToolsSite = defineSite({
  id: "crypto-tools",
  name: "Crypto Tools",
  domain: "wristnerd.site",
  niche: "Cryptocurrency Tools & Reviews",
  devAlias: "crypto.localhost",

  colors: { primary: "#0F172A", accent: "#F59E0B" },
  fonts: "modern",
  homepage: "standard",

  features: [
    "blog",
    "comparisons",
    "deals",
    "newsletter",
    "rssFeed",
    "search",
    "scheduling",
  ],

  contactPage: false,
  affiliateDisclosurePage: false,
});
