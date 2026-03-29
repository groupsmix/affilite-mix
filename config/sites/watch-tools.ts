import { defineSite } from "../define-site";

export const watchToolsSite = defineSite({
  id: "watch-tools",
  name: "WristNerd",
  domain: "wristnerd.xyz",
  niche: "Watch Gift Guides & Reviews",
  devAlias: "watch.localhost",

  colors: { primary: "#1B2A4A", accent: "#C9A96E" },
  fonts: "classic",
  homepage: "cinematic",

  productLabel: "Watch",
  productLabelPlural: "Watches",

  features: [
    "blog",
    "comparisons",
    "deals",
    "newsletter",
    "rssFeed",
    "search",
    "scheduling",
    "giftFinder",
    "cookieConsent",
    "taxonomyPages",
    "brandSpotlights",
  ],
});
