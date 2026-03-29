import type { SiteDefinition } from "../site-definition";

export const watchToolsSite: SiteDefinition = {
  id: "watch-tools",
  name: "WristNerd",
  domain: "wristnerd.xyz",
  aliases: ["watch.localhost"],
  language: "en",
  direction: "ltr",
  locale: "en_US",

  brand: {
    description:
      "Expert watch gift guides and reviews — honest ratings and a proprietary Gift-Worthiness Score to help you pick the perfect watch.",
    contactEmail: "contact@wristnerd.xyz",
    niche: "Watch Gift Guides & Reviews",
  },

  theme: {
    primaryColor: "#1B2A4A",
    accentColor: "#C9A96E",
    fontHeading: "Playfair Display",
    fontBody: "Inter",
  },

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
    ],
  },

  contentTypes: [
    {
      value: "article",
      label: "Article",
      commercial: false,
      layout: "standard",
    },
    {
      value: "review",
      label: "Review",
      commercial: true,
      layout: "sidebar",
    },
    {
      value: "comparison",
      label: "Comparison",
      commercial: true,
      layout: "sidebar",
      minProducts: 2,
    },
    {
      value: "guide",
      label: "Guide",
      commercial: false,
      layout: "standard",
    },
  ],

  productLabel: "Watch",
  productLabelPlural: "Watches",

  affiliateDisclosure:
    "This page contains affiliate links. We may earn a commission at no extra cost to you.",
  contentDisclosure:
    "This page contains affiliate links. We may earn a commission if you purchase through our links.",

  features: {
    blog: { source: "database" },
    brandSpotlights: true,
    giftFinder: true,
    newsletter: true,
    rssFeed: true,
    searchModal: true,
    scheduling: true,
    comparisons: true,
    deals: true,
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
  },

  seo: {
    robotsDisallow: ["/admin/", "/api/"],
    sitemapStaticPages: [
      { path: "/", priority: 1, changeFrequency: "daily" },
      { path: "/gift-finder", priority: 0.9, changeFrequency: "weekly" },
    ],
  },
};
