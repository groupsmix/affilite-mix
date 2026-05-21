import { defineSite } from "../define-site";

export const cryptoToolsSite = defineSite({
  id: "crypto-tools",
  name: "CryptoRanked",
  domain: "cryptoranked.xyz",
  aliases: ["crypto.localhost"],
  niche: "Crypto Exchanges & Wallet Reviews",
  description:
    "Compare crypto exchanges, wallets, and DeFi tools — honest reviews and affiliate deals.",

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
      { title: "Affiliate Disclosure", href: "/affiliate-disclosure" },
      { title: "Contact", href: "/contact" },
    ],
  },

  pages: {
    about: {
      title: "About CryptoRanked",
      description: "Honest crypto exchange and wallet reviews you can trust",
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
      description: "Get in touch with the CryptoRanked team",
      email: "contact@cryptoranked.xyz",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },
});
