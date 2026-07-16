import { defineSite } from "../define-site";

/**
 * Crypto Tax AU — Australian crypto-tax authority site.
 *
 * Niche: Australian crypto tax for DeFi, staking, airdrop and NFT users.
 * Monetised by recurring crypto-tax software affiliates (Koinly, Syla,
 * CoinLedger, Crypto Tax Calculator) plus crypto-accountant referrals.
 *
 * IMPORTANT (owner action): update `domain` (and DNS / wildcard) to your real
 * domain once registered. The affiliate links in scripts/seed-crypto-tax-au.ts
 * are official-site placeholders — replace them with your approved tracking
 * links after you join each program.
 */
export const cryptoTaxAuSite = defineSite({
  id: "crypto-tax-au",
  name: "Crypto Tax AU",
  domain: "cryptotaxau.com",
  aliases: ["crypto-tax-au.localhost"],
  niche: "Australian Crypto Tax for DeFi, Staking, Airdrops & NFTs",
  description:
    "Plain-English Australian crypto tax guides and software reviews for DeFi, staking, airdrop and NFT investors — built around ATO rules so you can lodge on time and pay less.",

  colors: { primary: "#0B2540", accent: "#16A34A", accentText: "#15803D" },
  fonts: "modern",

  features: [
    "blog",
    "newsletter",
    "rssFeed",
    "search",
    "scheduling",
    "comparisons",
    "deals",
    "taxonomyPages",
    "cookieConsent",
  ],

  contentDisclosure:
    "This page contains affiliate links. We may earn a commission at no extra cost to you if you sign up through our links. General information only — not tax advice. Verify with the ATO or a registered tax agent.",
  affiliateDisclosure:
    "Crypto Tax AU earns affiliate commissions from crypto-tax software and accountant referrals. This never changes what you pay, and we only recommend tools we believe help Australian crypto investors report accurately.",

  nav: [
    { title: "Home", href: "/" },
    { title: "Tax Guides", href: "/guide" },
    { title: "Software Reviews", href: "/review" },
    { title: "Comparisons", href: "/comparison" },
  ],

  footerNav: {
    quickLinks: [
      { title: "Crypto Tax Guide", href: "/guide" },
      { title: "Best Crypto Tax Software", href: "/comparison" },
      { title: "Software Reviews", href: "/review" },
    ],
    topics: [
      { title: "DeFi Tax", href: "/category/defi-tax" },
      { title: "Staking Tax", href: "/category/staking-tax" },
      { title: "Airdrop Tax", href: "/category/airdrop-tax" },
      { title: "NFT Tax", href: "/category/nft-tax" },
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
      title: "About Crypto Tax AU",
      description:
        "Independent Australian crypto tax guides and software reviews for DeFi, staking, airdrop and NFT investors.",
    },
    privacy: {
      title: "Privacy Policy",
      description: "How we handle your data",
    },
    terms: {
      title: "Terms of Service",
      description: "Terms and conditions of use. General information only — not tax advice.",
    },
    contact: {
      title: "Contact Us",
      description: "Get in touch with the Crypto Tax AU team",
      email: "contact@cryptotaxau.com",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },
});
