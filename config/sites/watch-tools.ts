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

  // Deep charcoal with a teal accent and soft radius — avoids the warm-cream/
  // terracotta, acid-green-on-black, and broadsheet defaults.
  colors: {
    primary: "#0B0F13",
    accent: "#2A9D8F",
    accentText: "#2A9D8F",
    accentLight: "rgba(42,157,143,0.12)",
  },
  fonts: { heading: "Playfair Display", body: "DM Sans" },
  homepage: "dial",
  layout: "standard",
  headerVariant: "standard",
  footerVariant: "compare",

  affiliateDisclosure:
    "WristNerd is reader-supported. When you buy through links on our site, we may earn an affiliate commission at no additional cost to you. This never influences our rankings — we only recommend watches we would buy ourselves.",

  headerConfig: {
    showCta: true,
    ctaLabel: "See top picks",
    ctaHref: "/#top-picks",
    showSearch: false,
    navAlignment: "center",
  },
  headerTokens: {
    appearance: "dark",
    background: "rgba(11,15,19,0.85)",
    foreground: "#F5F7FA",
    accent: "#2A9D8F",
    border: "rgba(245,247,250,0.1)",
    fontFamily: "Playfair Display",
  },

  productLabel: "Watch",
  productLabelPlural: "Watches",
  productCardStyle: "detailed",

  contentTypes: [
    { value: "article", label: "Article", commercial: false, layout: "standard" },
    { value: "review", label: "Review", commercial: true, layout: "sidebar" },
    {
      value: "comparison",
      label: "Comparison",
      commercial: true,
      layout: "sidebar",
      minProducts: 2,
    },
    { value: "guide", label: "Guide", commercial: false, layout: "standard" },
    { value: "blog", label: "Blog", commercial: false, layout: "standard" },
  ],

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
    { title: "Blog", href: "/blog" },
    { title: "Gift Finder", href: "/gift-finder" },
  ],

  footerNav: {
    guides: [
      { title: "Best Under $300", href: "/best-watches-under-300" },
      { title: "Best Under $500", href: "/best-watches-under-500" },
      { title: "Best Dress Watch", href: "/best-dress-watch-under-500" },
      { title: "Blog", href: "/blog" },
      { title: "Top Picks", href: "/#top-picks" },
      { title: "How We Test", href: "/#how-we-test" },
    ],
    about: [
      { title: "How We Test", href: "/how-we-rank" },
      { title: "Editorial Policy", href: "/about" },
      { title: "Meet the Team", href: "/about" },
      { title: "Contact", href: "/contact" },
    ],
    legal: [
      { title: "Privacy Policy", href: "/privacy" },
      { title: "Terms of Service", href: "/terms" },
      { title: "Affiliate Disclosure", href: "/affiliate-disclosure" },
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
    { path: "/best-watches-under-500", priority: 0.9, changeFrequency: "monthly" },
    { path: "/best-watches-under-300", priority: 0.8, changeFrequency: "monthly" },
    { path: "/best-watches-under-200", priority: 0.8, changeFrequency: "monthly" },
    { path: "/best-dress-watch-under-500", priority: 0.8, changeFrequency: "monthly" },
    { path: "/guide/vintage-casio-watches", priority: 0.7, changeFrequency: "monthly" },
    { path: "/guide/vintage-seiko-watches", priority: 0.7, changeFrequency: "monthly" },
    { path: "/guide/best-leather-watch-straps", priority: 0.7, changeFrequency: "monthly" },
    { path: "/guide/minimalist-watches-for-women", priority: 0.6, changeFrequency: "monthly" },
  ],
});
