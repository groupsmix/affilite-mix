import { defineSite } from "../define-site";

export const aiComparedSite = defineSite({
  id: "ai-compared",
  name: "CompareAI",
  domain: "compareai.site",
  aliases: ["ai.localhost"],
  niche: "AI-Powered Etsy Growth Tools & Workflows",
  description:
    "Honest reviews, side-by-side comparisons, and practical AI workflows for Etsy print-on-demand and digital-product sellers.",
  tagline: "Honest reviews, side-by-side comparisons, and no AI hype.",
  logo: "/images/compareai/compareai-icon.png",
  faviconUrl: "/images/compareai/compareai-favicon.png",

  // Trust-first palette (replaces the old purple "AI hype" scheme).
  // Cool ink canvas for dark sections + Trust Cobalt for actions.
  colors: {
    primary: "#0B1120",
    accent: "#2D6BF0",
    accentText: "#1B49C7",
    accentLight: "#3B82F6",
  },
  fonts: "modern",
  homepage: "etsy",
  layout: "compare",
  headerConfig: {
    logoMode: "wordmark",
    showCta: true,
    ctaLabel: "Compare tools",
    ctaHref: "/tools",
  },

  productLabel: "Tool",
  productLabelPlural: "Tools",

  features: ["blog", "rssFeed", "search", "scheduling", "comparisons", "deals", "cookieConsent"],

  contentDisclosure:
    "This page contains affiliate links. We may earn a commission if you sign up through our links.",

  nav: [
    { title: "Home", href: "/" },
    { title: "Tools", href: "/tools" },
    { title: "Comparisons", href: "/comparison" },
    { title: "Guides", href: "/guide" },
    { title: "Reviews", href: "/review" },
  ],

  footerNav: {
    quickLinks: [
      { title: "Home", href: "/" },
      { title: "Tools", href: "/tools" },
      { title: "Comparisons", href: "/comparison" },
      { title: "Guides", href: "/guide" },
      { title: "Reviews", href: "/review" },
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
      title: "About CompareAI",
      description: "How we test and review AI tools for Etsy sellers",
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
      description: "Get in touch with the CompareAI team",
      email: "contact@compareai.site",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },

  sitemapExtraPages: [
    { path: "/tools", priority: 0.9, changeFrequency: "weekly" },
    { path: "/tools/etsy-profit-calculator", priority: 0.9, changeFrequency: "monthly" },
    { path: "/guide", priority: 0.8, changeFrequency: "weekly" },
    { path: "/guide/everbee-pricing-and-break-even", priority: 0.8, changeFrequency: "monthly" },
    { path: "/comparison", priority: 0.8, changeFrequency: "weekly" },
    { path: "/comparison/alura-vs-everbee", priority: 0.8, changeFrequency: "monthly" },
    { path: "/comparison/canva-for-etsy-pod-vs-kittl", priority: 0.8, changeFrequency: "monthly" },
    { path: "/review", priority: 0.7, changeFrequency: "weekly" },
    { path: "/review/is-everbee-worth-it-for-new-shop", priority: 0.8, changeFrequency: "monthly" },
  ],
});
