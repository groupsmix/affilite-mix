import { defineSite } from "../define-site";

export const aiComparedSite = defineSite({
  id: "ai-compared",
  name: "AI Compared",
  domain: "aicompared.site",
  aliases: ["ai.localhost"],
  niche: "AI Tools & Software Reviews",
  description:
    "In-depth reviews and comparisons of AI tools, platforms, and software — find the best AI for your workflow.",

  colors: { primary: "#2E1065", accent: "#8B5CF6", accentText: "#6D28D9" },
  fonts: "modern",
  homepage: "minimal",

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

  contentDisclosure:
    "This page contains affiliate links. We may earn a commission if you sign up through our links.",

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
      title: "About AI Compared",
      description: "Honest AI tool reviews and comparisons you can trust",
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
      description: "Get in touch with the AI Compared team",
      email: "contact@aicompared.site",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },
});
