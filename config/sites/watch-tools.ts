import { defineSite } from "../define-site";

export const watchToolsSite = defineSite({
  id: "watch-tools",
  name: "WristNerd",
  domain: "wristnerd.xyz",
  aliases: ["www.wristnerd.xyz", "watch.localhost"],
  niche: "Watch Buying Guides & Reviews",
  description:
    "Honest watch reviews and buying guides — from the best watches under $500 to vintage Seiko and Casio, leather straps, and minimalist picks for women.",
  tagline: "Find the right watch without the hype.",

  // A68-F1: Darkened accent from #C9A96E (2.6:1 contrast on white) to #8B6914
  // which passes WCAG 2.2 AA 4.5:1 requirement for normal text. The original
  // gold is retained as accentLight for decorative/large-text contexts only.
  colors: { primary: "#1B2A4A", accent: "#8B6914", accentText: "#6B4F0F", accentLight: "#C9A96E" },
  fonts: "classic",
  homepage: "compare",
  layout: "compare",

  productLabel: "Watch",
  productLabelPlural: "Watches",
  productCardStyle: "detailed",

  features: [
    "blog",
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
      description: "Honest watch buying guides and reviews",
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

  sitemapExtraPages: [
    { path: "/guide", priority: 0.9, changeFrequency: "weekly" },
    { path: "/guide/best-watches-under-500", priority: 0.9, changeFrequency: "monthly" },
    { path: "/guide/best-watches-under-300", priority: 0.8, changeFrequency: "monthly" },
    { path: "/guide/best-watches-under-200", priority: 0.8, changeFrequency: "monthly" },
    { path: "/guide/best-dress-watches-under-500", priority: 0.8, changeFrequency: "monthly" },
    { path: "/guide/vintage-casio-watches", priority: 0.7, changeFrequency: "monthly" },
    { path: "/guide/vintage-seiko-watches", priority: 0.7, changeFrequency: "monthly" },
    { path: "/guide/best-leather-watch-straps", priority: 0.7, changeFrequency: "monthly" },
    { path: "/guide/minimalist-watches-for-women", priority: 0.6, changeFrequency: "monthly" },
  ],
});
