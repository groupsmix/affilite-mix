import { defineSite } from "../define-site";

export const cryptoToolsSite = defineSite({
  id: "crypto-tools",
  name: "Crypto Tools",
  domain: "crypto.wristnerd.site",
  aliases: ["crypto.localhost", "wristnerd.site"],
  niche: "Cryptocurrency Tools & Reviews",
  description: "Compare crypto exchanges, wallets, and DeFi tools — honest reviews and affiliate deals.",

  colors: { primary: "#0F172A", accent: "#F59E0B", accentText: "#B45309" },
  fonts: "modern",

  features: ["blog", "newsletter", "rssFeed", "search", "scheduling", "comparisons", "deals"],

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
    ],
    legal: [
      { title: "About", href: "/about" },
      { title: "Privacy Policy", href: "/privacy" },
      { title: "Terms of Service", href: "/terms" },
    ],
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

  contactPage: false,
  affiliateDisclosurePage: false,
});
