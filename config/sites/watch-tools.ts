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

  // Warm, editorial watch palette: espresso ink for dark sections and gold
  // accents. Distinct from the crypto/AI navy used by other tenants.
  colors: { primary: "#2C241B", accent: "#8B6914", accentText: "#6B4F0F", accentLight: "#C9A96E" },
  fonts: "classic",
  homepage: "dial",
  layout: "standard",
  headerVariant: "standard",
  footerVariant: "compare",

  headerConfig: {
    showCta: true,
    ctaLabel: "See top picks",
    ctaHref: "/#top-picks",
    showSearch: false,
    navAlignment: "center",
  },
  headerTokens: {
    appearance: "dark",
    background: "rgba(22,20,18,0.85)",
    foreground: "#F5F3EE",
    accent: "#C9A96E",
    border: "rgba(245,243,238,0.1)",
    fontFamily: "Playfair Display",
  },

  productLabel: "Watch",
  productLabelPlural: "Watches",
  productCardStyle: "detailed",

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
    guides: [
      { title: "Best Under $300", href: "/guide/best-watches-under-300" },
      { title: "Best Under $500", href: "/guide/best-watches-under-500" },
      { title: "Best Dress Watch", href: "/guide/best-dress-watch-under-500" },
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
