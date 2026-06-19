import { defineSite } from "../define-site";

export const aiComparedSite = defineSite({
  id: "ai-compared",
  name: "AI Compared",
  domain: "compareai.site",
  aliases: ["ai.localhost"],
  niche: "AI Tools & Software Reviews",
  description:
    "In-depth reviews and comparisons of AI tools, platforms, and software — find the best AI for your workflow.",

  // Trust-first palette (replaces the old purple #2E1065 / #8B5CF6 "AI hype"
  // scheme). Cool ink brand color + Trust Cobalt as the signal. Blue reads as
  // stable, secure, and impartial — the right tone for an independent review
  // authority. Verified-green winner accents live in the compare homepage.
  //   primary    = ink canvas for dark sections (cool charcoal, not pure black)
  //   accent     = Trust Cobalt (buttons, links, active states) — WCAG AA on white text
  //   accentText = deep cobalt, AA-safe as link text on white (7.4:1)
  //   accentLight= brighter cobalt for large/decorative use on dark surfaces
  colors: {
    primary: "#0B1120",
    accent: "#2D6BF0",
    accentText: "#1B49C7",
    accentLight: "#3B82F6",
  },
  fonts: "modern",
  homepage: "compare",

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
      email: "contact@compareai.site",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },
});
