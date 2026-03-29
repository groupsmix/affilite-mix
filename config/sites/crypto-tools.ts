import type { SiteDefinition } from "../site-definition";

export const cryptoToolsSite: SiteDefinition = {
  id: "crypto-tools",
  name: "Crypto Tools",
  domain: "crypto.wristnerd.site",
  aliases: ["crypto.localhost", "wristnerd.site"],
  language: "en",
  direction: "ltr",
  locale: "en_US",

  brand: {
    description:
      "Compare crypto exchanges, wallets, and DeFi tools — honest reviews and affiliate deals.",
    contactEmail: "contact@wristnerd.site",
    niche: "Cryptocurrency Tools & Reviews",
  },

  theme: {
    primaryColor: "#0F172A",
    accentColor: "#F59E0B",
    fontHeading: "Inter",
    fontBody: "Inter",
  },

  nav: [
    { title: "Home", href: "/" },
    { title: "Reviews", href: "/review" },
    { title: "Comparisons", href: "/comparison" },
    { title: "Guides", href: "/guide" },
  ],

  footerNav: {
    quickLinks: [
      { title: "Home", href: "/" },
      { title: "Reviews", href: "/review" },
      { title: "Comparisons", href: "/comparison" },
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

  productLabel: "Product",
  productLabelPlural: "Products",

  affiliateDisclosure:
    "This page contains affiliate links. We may earn a commission at no extra cost to you.",
  contentDisclosure:
    "This page contains affiliate links. We may earn a commission if you sign up through our links.",

  features: {
    blog: { source: "database" },
    newsletter: true,
    rssFeed: true,
    searchModal: true,
    scheduling: true,
    comparisons: true,
    deals: true,
  },

  pages: {
    about: {
      title: "About Crypto Tools",
      description: "Learn more about our crypto comparison platform",
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
    ],
  },
};
