import { defineSite } from "../define-site";

export const watchToolsSite = defineSite({
  id: "watch-tools",
  name: "WristNerd",
  domain: "wristnerd.xyz",
  aliases: ["watch.localhost"],
  niche: "Watch Gift Guides & Reviews",
  description:
    "Expert watch gift guides and reviews — honest ratings and a proprietary Gift-Worthiness Score to help you pick the perfect watch.",

  // A68-F1: Darkened accent from #C9A96E (2.6:1 contrast on white) to #8B6914
  // which passes WCAG 2.2 AA 4.5:1 requirement for normal text. The original
  // gold is retained as accentLight for decorative/large-text contexts only.
  colors: { primary: "#1B2A4A", accent: "#8B6914", accentText: "#6B4F0F", accentLight: "#C9A96E" },
  fonts: "classic",
  homepage: "showcase",

  productLabel: "Watch",
  productLabelPlural: "Watches",

  features: [
    "blog",
    "brandSpotlights",
    "comparisons",
    "cookieConsent",
    "deals",
    "giftFinder",
    "newsletter",
    "rssFeed",
    "scheduling",
    "search",
    "taxonomyPages",
  ],

  nav: [
    { title: "Home", href: "/" },
    { title: "Reviews", href: "/review" },
    { title: "Comparisons", href: "/comparison" },
    { title: "Guides", href: "/guide" },
    { title: "Gift Finder", href: "/gift-finder" },
  ],

  footerNav: {
    quickLinks: [
      { title: "Home", href: "/" },
      { title: "Reviews", href: "/review" },
      { title: "Comparisons", href: "/comparison" },
      { title: "Gift Finder", href: "/gift-finder" },
    ],
    legal: [
      { title: "About", href: "/about" },
      { title: "Privacy Policy", href: "/privacy" },
      { title: "Terms of Service", href: "/terms" },
      { title: "Affiliate Disclosure", href: "/affiliate-disclosure" },
      { title: "Contact", href: "/contact" },
    ],
  },

  pages: {
    about: {
      title: "About WristNerd",
      description: "Expert watch gift guides and honest reviews",
    },
    privacy: {
      title: "Privacy Policy",
      description: "How we handle your data",
    },
    terms: {
      title: "Terms of Service",
      description: "Terms and conditions of use",
    },
    contact: {
      title: "Contact Us",
      description: "Get in touch with the WristNerd team",
      email: "contact@wristnerd.xyz",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },
});
