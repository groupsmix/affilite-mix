import { defineSite } from "../define-site";

/**
 * Crypto Tax AU — Australian crypto-tax authority site.
 *
 * Niche: Australian crypto tax for DeFi, staking, airdrop and NFT users.
 * Monetised by recurring crypto-tax software affiliates (Koinly, Syla,
 * CoinLedger, Crypto Tax Calculator, CoinTracking, Coinpanda) plus crypto-accountant referrals.
 *
 * The tenant id stays `crypto-tools` (and the domain stays cryptoranked.xyz)
 * so the existing Cloudflare Worker domain, DNS and Terraform wiring are
 * reused — this repurposes the old generic exchange scaffold into the tax
 * site. The DB `sites` row is updated by
 * supabase/migrations/2026071507_repurpose_crypto_tools_crypto_tax.sql.
 *
 * OWNER ACTION: cryptoranked.xyz is a temporary domain. When you register the
 * final domain (e.g. cryptotaxau.site) add it as the primary domain here + in
 * Cloudflare/DNS and update the seed script.
 *
 * The affiliate links in scripts/seed-crypto-tax-au.ts are official-site
 * placeholders — replace them with your approved tracking links after you
 * join each program. Content is general ATO information, not tax advice.
 */
export const cryptoToolsSite = defineSite({
  id: "crypto-tools",
  name: "Crypto Tax AU",
  domain: "cryptoranked.xyz",
  aliases: ["crypto.localhost"],
  niche: "Australian Crypto Tax for DeFi, Staking, Airdrops & NFTs",
  description:
    "Plain-English Australian crypto tax guides and software reviews for DeFi, staking, airdrop and NFT investors — built around ATO rules so you can lodge on time and pay less.",
  tagline: "ATO-aligned guidance. No sponsored rankings.",
  logo: "/images/crypto-tax-au-logo.png",

  colors: { primary: "#0B2540", accent: "#16A34A", accentText: "#15803D" },
  fonts: { heading: "Geist", body: "Geist" },

  // Branded dark header/footer with a green accent stripe and a clear CTA.
  layout: "compare",
  headerConfig: {
    logoMode: "image-and-text",
    showCta: true,
    ctaLabel: "Find my tax tool",
    ctaHref: "/#finder",
    navAlignment: "center",
  },
  footerConfig: { showNewsletter: false },

  // Situation-triage "answer engine" homepage — see homepage-taxfinder.tsx.
  homepage: "taxfinder",

  features: ["rssFeed", "search", "comparisons", "cookieConsent"],

  contentDisclosure:
    "This page contains affiliate links. We may earn a commission at no extra cost to you if you sign up through our links. General information only — not tax advice. Verify with the ATO or a registered tax agent.",
  affiliateDisclosure:
    "Crypto Tax AU earns affiliate commissions from crypto-tax software and accountant referrals. This never changes what you pay, and we only recommend tools we believe help Australian crypto investors report accurately.",

  nav: [
    { title: "Home", href: "/" },
    { title: "Tax Guides", href: "/guide" },
    { title: "Software Reviews", href: "/review" },
    { title: "Comparisons", href: "/comparison" },
    {
      title: "Tools",
      href: "/tools",
      children: [
        { title: "Software Comparison", href: "/tools/crypto-tax-comparison" },
        { title: "CGT Calculator", href: "/tools/cgt-calculator" },
        { title: "Sync Guides", href: "/tools/sync-guide/coinspot/koinly" },
      ],
    },
  ],

  sitemapExtraPages: [{ path: "/how-we-rank", priority: 0.5, changeFrequency: "monthly" }],

  footerNav: {
    quickLinks: [
      { title: "Crypto Tax Guide", href: "/guide" },
      { title: "Best Crypto Tax Software", href: "/comparison" },
      { title: "Software Reviews", href: "/review" },
      { title: "CGT Calculator", href: "/tools/cgt-calculator" },
      { title: "Software Comparison", href: "/tools/crypto-tax-comparison" },
    ],
    topics: [
      { title: "DeFi Tax", href: "/category/defi-tax" },
      { title: "Staking Tax", href: "/category/staking-tax" },
      { title: "Airdrop Tax", href: "/category/airdrop-tax" },
      { title: "NFT Tax", href: "/category/nft-tax" },
    ],
    legal: [
      { title: "About", href: "/about" },
      { title: "How We Rank", href: "/how-we-rank" },
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
      email: "contact@cryptoranked.xyz",
    },
    affiliateDisclosurePage: {
      title: "Affiliate Disclosure",
      description: "How we earn revenue and maintain editorial independence",
    },
  },
});
