import { defineSite } from "../define-site";

export const calmToolsSite = defineSite({
  id: "calm-tools",
  name: "CalmRoutine",
  domain: "calmroutine.site",
  aliases: ["calm.localhost"],
  niche: "Small-Space Home Organization & Calm-Living Systems",
  description:
    "Find calm in the clutter. Curated, renter-friendly home organization tools and systems that make everyday routines feel lighter.",

  colors: { primary: "#1F4E45", accent: "#D4B483", accentText: "#8B6B3E", accentLight: "#F0E6D2" },
  fonts: "modern",
  homepage: "showcase",
  layout: "magazine",

  productLabel: "Product",
  productLabelPlural: "Products",

  features: [
    "blog",
    "newsletter",
    "rssFeed",
    "search",
    "scheduling",
    "comparisons",
    "deals",
    "cookieConsent",
  ],

  nav: [
    { title: "Home", href: "/" },
    { title: "Reviews", href: "/review" },
    { title: "Comparisons", href: "/comparison" },
    { title: "Guides", href: "/guide" },
    { title: "Deals", href: "/deals" },
  ],

  footerNav: {
    quickLinks: [
      { title: "Home", href: "/" },
      { title: "Reviews", href: "/review" },
      { title: "Comparisons", href: "/comparison" },
      { title: "Guides", href: "/guide" },
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
      title: "About CalmRoutine",
      description: "Helping you find calm through better organization",
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
      description: "Get in touch with the CalmRoutine team",
      email: "contact@calmroutine.site",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },
});
