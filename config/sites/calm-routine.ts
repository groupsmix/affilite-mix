import { defineSite } from "../define-site";

export const calmRoutineSite = defineSite({
  id: "calm-routine",
  name: "calmroutine",
  domain: "calmroutine.site",
  aliases: ["calm.localhost"],
  niche: "Practical nervous system reset routines",
  description:
    "Body-based routines to reset your nervous system — morning, workday, and evening resets, somatic exercises, and honest reviews. Tools, not treatment.",

  // Calm, natural palette: warm off-white background, deep teal primary,
  // mid-teal accent. Avoids the warm-cream/terracotta and acid-green-on-black
  // AI defaults while keeping a warm, human feel.
  colors: {
    primary: "#085041",
    accent: "#1D9E75",
    accentText: "#085041",
    accentLight: "#E1F5EE",
  },
  fonts: { heading: "Fraunces", body: "Public Sans" },
  homepage: "calmroutine",
  layout: "minimal",
  logo: "/images/calmroutine/og.png",
  faviconUrl: "/favicon-calmroutine.svg",

  productLabel: "Tool",
  productLabelPlural: "Tools",

  features: ["newsletter", "rssFeed", "cookieConsent"],

  affiliateDisclosure:
    "calmroutine is reader-supported. When you buy through links on our site, we may earn an affiliate commission at no additional cost to you. This never influences our recommendations — we only link to tools we have tested ourselves.",

  contentDisclosure:
    "This page contains affiliate links. We may earn a commission at no extra cost to you.",

  nav: [
    { title: "Reset Routines", href: "/category/reset-routines" },
    { title: "Somatic Practices", href: "/category/somatic-practices" },
    { title: "Reviews", href: "/category/reviews" },
    { title: "Tools", href: "/tools" },
    { title: "About", href: "/about" },
  ],

  footerNav: {
    quickLinks: [
      { title: "Reset Routines", href: "/category/reset-routines" },
      { title: "Somatic Practices", href: "/category/somatic-practices" },
      { title: "Reviews", href: "/category/reviews" },
      { title: "Tools", href: "/tools" },
    ],
    legal: [
      { title: "About", href: "/about" },
      { title: "Contact", href: "/contact" },
      { title: "Privacy Policy", href: "/privacy" },
      { title: "Affiliate Disclosure", href: "/affiliate-disclosure" },
    ],
  },

  pages: {
    about: {
      title: "About calmroutine",
      description:
        "Practical, body-based routines to help your nervous system settle — and the person behind them.",
    },
    privacy: {
      title: "Privacy Policy",
      description: "What calmroutine collects, why, and how it is handled.",
    },
    terms: {
      title: "Terms of Service",
      description: "The terms and conditions for using calmroutine.",
    },
    contact: {
      title: "Contact Us",
      description:
        "Send a note to calmroutine — questions, corrections, or a routine that helped you.",
      email: "contact@calmroutine.site",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How calmroutine uses affiliate links, in plain language.",
    },
  },

  sitemapExtraPages: [
    { path: "/category/reset-routines", priority: 0.9, changeFrequency: "monthly" },
    { path: "/category/somatic-practices", priority: 0.8, changeFrequency: "monthly" },
    { path: "/category/reviews", priority: 0.8, changeFrequency: "monthly" },
    { path: "/tools", priority: 0.8, changeFrequency: "monthly" },
    { path: "/newsletter", priority: 0.7, changeFrequency: "monthly" },
    { path: "/reset-nervous-system", priority: 0.9, changeFrequency: "monthly" },
    { path: "/yoga-for-nervous-system-reset", priority: 0.8, changeFrequency: "monthly" },
    { path: "/morning-routines-for-anxiety", priority: 0.8, changeFrequency: "monthly" },
    { path: "/somatic-exercises-for-anxiety", priority: 0.8, changeFrequency: "monthly" },
    { path: "/best-weighted-blanket-for-anxiety", priority: 0.8, changeFrequency: "monthly" },
  ],
});
