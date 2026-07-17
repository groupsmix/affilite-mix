#!/usr/bin/env tsx
/**
 * Seed script for the "Crypto Tax AU" site (crypto-tools tenant, cryptoranked.xyz).
 *
 * Niche: Australian crypto tax for DeFi, staking, airdrop and NFT users.
 * Populates categories, crypto-tax software products (Koinly, Syla, Crypto Tax
 * Calculator, CoinLedger, CoinTracking) + a crypto-accountant referral, and
 * ATO-focused review / comparison / guide content, wired together through the
 * content_products join table.
 *
 * Idempotent — safe to run multiple times (upserts by slug).
 *
 * Usage:
 *   npm run seed:crypto-tax-au
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL env vars.
 *
 * OWNER ACTION: affiliate_url values are the tools' official URLs as
 * placeholders. Replace them with your real affiliate tracking links once
 * you're approved into each program (Koinly, Syla, Crypto Tax Calculator,
 * CoinLedger, CoinTracking) and once you set up your accountant referral
 * partner or lead form.
 *
 * DISCLAIMER: content is general information about ATO rules, not tax advice.
 * Users should verify with the ATO (ato.gov.au) or a registered tax agent.
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ── Site ───────────────────────────────────────────────────────────────
// Repurposes the existing `crypto-tools` tenant (domain cryptoranked.xyz) into
// the Australian crypto-tax site — reusing its Cloudflare/DNS wiring. The
// site row's identity (name/nav/theme/meta) is updated by
// supabase/migrations/2026071507_repurpose_crypto_tools_crypto_tax.sql; this
// script only seeds categories, products and content. Update the slug/domain
// here if you later move to a dedicated tenant or domain.
const SITE = {
  slug: "crypto-tools",
  name: "Crypto Tax AU",
  domain: "cryptoranked.xyz",
  language: "en",
  direction: "ltr" as const,
};

// ── Categories (topic hubs) ──────────────────────────────────────────────
const categories = [
  {
    slug: "crypto-tax-basics",
    name: "Crypto Tax Basics",
    description:
      "How the ATO taxes crypto in Australia — CGT, income, the 12-month discount, deadlines and record keeping.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "defi-tax",
    name: "DeFi Tax",
    description:
      "How Australian DeFi activity is taxed by the ATO — swaps, liquidity pools, lending, wrapping and yield.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "staking-tax",
    name: "Staking & Rewards Tax",
    description:
      "How staking rewards, validator income and yield are taxed under ATO rules in Australia.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "airdrop-tax",
    name: "Airdrop Tax",
    description:
      "How crypto airdrops are taxed in Australia, including initial-allocation airdrops.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "nft-tax",
    name: "NFT Tax",
    description: "How NFTs are taxed by the ATO for collectors, traders and creators in Australia.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "crypto-tax-software",
    name: "Crypto Tax Software",
    description:
      "Reviews and comparisons of the best crypto tax software for Australian investors.",
    taxonomy_type: "general" as const,
  },
  {
    slug: "crypto-accountants",
    name: "Crypto Accountants",
    description:
      "When to use a crypto-specialist registered tax agent in Australia, and how to find one.",
    taxonomy_type: "general" as const,
  },
];

// ── Products (crypto-tax software + accountant referral) ──────────────────
interface ProductSeed {
  slug: string;
  name: string;
  category: string; // category slug
  description: string;
  affiliate_url: string;
  image_url?: string;
  merchant: string;
  price_label: string;
  price_amount: number;
  score: number; // 0–10
  featured: boolean;
  cta_text: string;
  pros: string;
  cons: string;
}

const products: ProductSeed[] = [
  {
    slug: "koinly",
    name: "Koinly",
    category: "crypto-tax-software",
    description:
      "Australian-founded crypto tax calculator with ATO-ready reports, 800+ exchange & wallet integrations, and strong DeFi and NFT support. Free to track your portfolio; pay only when you download a tax report.",
    affiliate_url: "https://koinly.io/",
    image_url: "https://canny.io/images/c6865c5b10c0822f213070de8af4d83e.png",
    merchant: "Koinly",
    price_label: "Free to track · from A$69/yr to file",
    price_amount: 69,
    score: 9.4,
    featured: true,
    cta_text: "Try Koinly Free",
    pros: "ATO-specific myTax reports, Huge exchange & wallet coverage, Strong DeFi & NFT handling, Free portfolio-tracking tier, Recurring affiliate program",
    cons: "Filing tiers priced per tax year, High-transaction plans get pricey",
  },
  {
    slug: "syla",
    name: "Syla",
    category: "crypto-tax-software",
    description:
      "Crypto tax software built exclusively for Australia and ATO rules, featuring 'Lowest Tax First Out' (LTFO) parcel selection that can legally reduce your capital gains tax.",
    affiliate_url: "https://www.syla.com.au/?code=BSETWZYW",
    image_url:
      "https://consumersiteimages.trustpilot.net/business-units/64919707d0dcf3c9c039d233-198x149-1x.jpg",
    merchant: "Syla",
    price_label: "From A$59/yr",
    price_amount: 59,
    score: 9.0,
    featured: true,
    cta_text: "Try Syla",
    pros: "Built only for Australia, LTFO parcel optimisation cuts CGT, Affordable AUD pricing, ATO myTax-ready reports",
    cons: "Australia-only (no other countries), Fewer integrations than Koinly",
  },
  {
    slug: "crypto-tax-calculator",
    name: "Crypto Tax Calculator",
    category: "crypto-tax-software",
    description:
      "Australian-founded tax platform that specialises in complex DeFi, derivatives and on-chain activity across 3,000+ integrations, with detailed ATO reports.",
    affiliate_url: "https://cryptotaxcalculator.io/",
    image_url: "https://cryptologos.zenobank.io/library/crypto-tax-calculator-icon-dark.png",
    merchant: "Crypto Tax Calculator",
    price_label: "From A$99/yr",
    price_amount: 99,
    score: 8.9,
    featured: true,
    cta_text: "Try Crypto Tax Calculator",
    pros: "Best-in-class DeFi & on-chain categorisation, 3,000+ integrations, Detailed ATO reports, Australian-founded",
    cons: "Pricier at high transaction volumes, Complex wallets can need manual review",
  },
  {
    slug: "coinledger",
    name: "CoinLedger",
    category: "crypto-tax-software",
    description:
      "Easy-to-use global crypto tax tool with Australian ATO report support and one of the more generous recurring affiliate programs in the niche.",
    affiliate_url: "https://coinledger.io?fpr=bonus&fp_sid=10bonus",
    image_url: "/images/product-coinledger.png",
    merchant: "CoinLedger",
    price_label: "From ~A$79/yr",
    price_amount: 79,
    score: 8.4,
    featured: true,
    cta_text: "Try CoinLedger",
    pros: "Simple, fast UX, Good customer support, ATO report export, ~25% recurring affiliate program",
    cons: "US-first product, Fewer Australia-specific features than Koinly or Syla",
  },
  {
    slug: "cointracking",
    name: "CoinTracking",
    category: "crypto-tax-software",
    description:
      "Veteran crypto portfolio and tax platform with deep reporting, analytics and a long-standing affiliate program. Has a free tier for smaller portfolios.",
    affiliate_url: "https://cointracking.info?ref=W792584",
    image_url: "https://cointracking.info/assets/img/logo_dark.svg",
    merchant: "CoinTracking",
    price_label: "Free tier · paid from ~A$150/yr",
    price_amount: 150,
    score: 8.0,
    featured: true,
    cta_text: "Try CoinTracking",
    pros: "Powerful reporting & analytics, Portfolio tracking, Lifetime plan options, Recurring affiliate program",
    cons: "Dated interface, Steeper learning curve for beginners",
  },
  {
    slug: "coinpanda",
    name: "Coinpanda",
    category: "crypto-tax-software",
    description:
      "Global crypto tax platform with 2,400+ exchange, wallet and blockchain integrations, strong DeFi and NFT support, and ATO-ready myTax reports for Australia.",
    affiliate_url: "https://coinpanda.io/?ref=f907b679d8cd",
    image_url:
      "https://downloads.intercomcdn.com/i/o/194401/23d9e21a8a6e90d95f07aad7/770e07dca425f8f77deff769a198c6b0.png",
    merchant: "Coinpanda",
    price_label: "Free 25 tx · from US$79/yr",
    price_amount: 79,
    score: 8.7,
    featured: true,
    cta_text: "Try Coinpanda",
    pros: "2,400+ integrations, Strong DeFi & NFT support, ATO myTax reports, 65+ countries including Australia, Free 25-transaction plan",
    cons: "USD pricing (no AUD), Higher tiers for very large volumes",
  },
  {
    slug: "crypto-accountant-au",
    name: "Find a Crypto Tax Accountant (AU)",
    category: "crypto-accountants",
    description:
      "Get matched with an Australian registered tax agent who specialises in crypto — ideal for heavy DeFi activity, high transaction volumes, prior-year catch-ups, or an ATO review.",
    affiliate_url: "https://cryptotaxau.com/contact",
    image_url: "/images/product-accountant-au.png",
    merchant: "Crypto Tax AU Partner Network",
    price_label: "Free matching",
    price_amount: 0,
    score: 9.1,
    featured: true,
    cta_text: "Get matched with an accountant",
    pros: "Registered tax agents, Crypto specialists, Handles complex DeFi & ATO audits, Can lodge the return for you",
    cons: "Costs more than DIY software, Best reserved for complex situations",
  },
];

// ── Content (guides / reviews / comparisons) ──────────────────────────────
interface ContentSeed {
  slug: string;
  title: string;
  type: "review" | "comparison" | "guide";
  excerpt: string;
  meta_title: string;
  meta_description: string;
  tags: string[];
  category: string; // category slug
  body: string;
  links: { product: string; role: "hero" | "featured" | "related" | "vs-left" | "vs-right" }[];
}

const AUTHOR = "Crypto Tax AU Editorial";

const DISCLAIMER = `<p><em>General information only, current as a guide to ATO rules — not personal tax advice. Crypto tax depends on your circumstances. Verify with the <a href="https://www.ato.gov.au/" rel="nofollow noopener" target="_blank">ATO</a> or a registered tax agent before you lodge.</em></p>`;

const content: ContentSeed[] = [
  // ── Pillar & basics guides ──
  {
    slug: "crypto-tax-australia-guide",
    title: "Crypto Tax in Australia: The Complete 2026 ATO Guide",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "How the ATO taxes crypto in Australia — capital gains, income, the 12-month discount, deadlines and how to lodge.",
    meta_title: "Crypto Tax Australia 2026: The Complete ATO Guide",
    meta_description:
      "How crypto is taxed in Australia in 2026: ATO CGT rules, the 50% discount, income vs capital, deadlines and how to report DeFi, staking, airdrops and NFTs.",
    tags: ["crypto-tax", "australia", "ato", "guide"],
    body: `<h2>How the ATO taxes crypto</h2>
<p>In Australia the ATO treats crypto as a <strong>CGT asset</strong> (property), not as money. That means most things you do with crypto are either a <strong>capital gains tax (CGT) event</strong> or <strong>ordinary income</strong> — and you report them in your annual tax return.</p>
<h2>What counts as a CGT event</h2>
<p>You trigger a CGT event when you <em>dispose</em> of crypto by:</p>
<ul>
<li>Selling crypto for AUD</li>
<li>Trading one crypto for another (yes — crypto-to-crypto is taxable)</li>
<li>Spending crypto on goods or services</li>
<li>Gifting crypto to someone else</li>
</ul>
<p>Your capital gain (or loss) is the AUD value at disposal minus your cost base (what you paid plus certain fees).</p>
<h2>The 12-month CGT discount</h2>
<p>If you're an individual and you hold a crypto asset for <strong>more than 12 months</strong> before disposing of it, you may be entitled to a <strong>50% CGT discount</strong> on the gain. Holding period is one of the biggest levers on your tax bill.</p>
<h2>When crypto is income, not CGT</h2>
<p>Some crypto is taxed as <strong>ordinary income</strong> at its AUD market value when you receive it — commonly staking rewards and many airdrops. That amount is then also your cost base for a future CGT event.</p>
<h2>Key dates</h2>
<p>The Australian financial year runs <strong>1 July to 30 June</strong>. If you self-lodge, your return is generally due by <strong>31 October</strong>. Using a registered tax agent can give you more time — but you usually need to be on their books before the deadline.</p>
<h2>How to actually do it</h2>
<p>Manually tracking crypto-to-crypto trades, DeFi and airdrops is painful and error-prone. Crypto tax software connects to your exchanges and wallets, applies ATO rules (including the 12-month discount), and generates a report you or your accountant can lodge. For most Australians, <strong>Koinly</strong> is the easiest starting point; <strong>Syla</strong> is a strong Australia-only option with tax-minimisation built in.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "syla", role: "featured" },
      { product: "crypto-accountant-au", role: "related" },
    ],
  },
  {
    slug: "do-i-pay-tax-on-crypto-australia",
    title: "Do I Have to Pay Tax on Crypto in Australia?",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Short answer: usually yes. Here's exactly when you owe tax on crypto in Australia — and when you don't.",
    meta_title: "Do I Pay Tax on Crypto in Australia? (2026 ATO Rules)",
    meta_description:
      "When you pay tax on crypto in Australia: disposals, crypto-to-crypto trades, staking and airdrops — plus what's not taxed. Based on ATO rules.",
    tags: ["crypto-tax", "australia", "ato"],
    body: `<h2>The short answer</h2>
<p>Yes — in almost all cases you pay tax on crypto in Australia. The ATO receives data directly from Australian exchanges, so "they won't know" is not a strategy.</p>
<h2>When you owe tax</h2>
<ul>
<li><strong>Selling crypto for AUD</strong> — CGT on the gain.</li>
<li><strong>Swapping crypto for crypto</strong> — CGT event, even without cashing out.</li>
<li><strong>Spending crypto</strong> — CGT event based on AUD value at the time.</li>
<li><strong>Staking rewards</strong> — ordinary income when received.</li>
<li><strong>Most airdrops</strong> — generally ordinary income at market value.</li>
</ul>
<h2>When you generally don't</h2>
<ul>
<li><strong>Buying crypto with AUD and holding it</strong> — no tax until you dispose.</li>
<li><strong>Transferring between your own wallets</strong> — not a disposal (keep records).</li>
<li><strong>A capital loss</strong> — no tax owed; losses can offset gains.</li>
</ul>
<p>The narrow "personal use asset" exemption almost never applies to investors — don't rely on it.</p>
<h2>Reduce it legally</h2>
<p>Hold longer than 12 months for the 50% CGT discount, harvest capital losses, and use software that picks the most tax-efficient parcels. Tools like <strong>Koinly</strong> and <strong>Syla</strong> automate this.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "syla", role: "related" },
    ],
  },
  {
    slug: "crypto-tax-deadline-australia",
    title: "Crypto Tax Deadline in Australia: Dates You Can't Miss",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "The Australian financial year ends 30 June and self-lodged returns are due 31 October. Here's how to be ready.",
    meta_title: "Crypto Tax Deadline Australia 2026 (31 October)",
    meta_description:
      "Australian crypto tax deadlines: financial year ends 30 June, self-lodged returns due 31 October. How to prepare your crypto report in time.",
    tags: ["crypto-tax", "australia", "deadline", "ato"],
    body: `<h2>The dates that matter</h2>
<ul>
<li><strong>30 June</strong> — the Australian financial year ends. All disposals, staking income and airdrops up to this date count for the year.</li>
<li><strong>1 July onward</strong> — you can start preparing and lodging your return.</li>
<li><strong>31 October</strong> — deadline to lodge if you're doing it yourself.</li>
<li><strong>Later (via a registered tax agent)</strong> — agents can lodge on extended dates, but you generally must be their client before 31 October.</li>
</ul>
<h2>Don't leave it to October</h2>
<p>Pulling a full year of exchange and wallet history together takes time, especially with DeFi and NFTs. Start early: connect your accounts to crypto tax software now, review the transactions it flags, and you'll have an ATO-ready report ready to lodge.</p>
<h2>Missed a past year?</h2>
<p>If you didn't report crypto in prior years, you can still fix it — amend past returns or lodge late. A crypto-specialist accountant can help you catch up and reduce penalties.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "crypto-accountant-au", role: "related" },
    ],
  },
  {
    slug: "ato-crypto-data-matching",
    title: "The ATO Is Watching Crypto: Data Matching Explained",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "The ATO runs a crypto data-matching program covering millions of accounts. Here's what it collects and what to do.",
    meta_title: "ATO Crypto Data Matching: What It Means for You",
    meta_description:
      "The ATO's crypto data-matching program collects records from Australian exchanges on millions of accounts. What it sees and how to stay compliant.",
    tags: ["ato", "data-matching", "crypto-tax", "australia"],
    body: `<h2>What is data matching?</h2>
<p>The ATO obtains transaction and account data directly from Australian crypto exchanges (designated service providers) under its data-matching program. It covers a large share of Australian crypto users and is used to pre-fill and cross-check tax returns.</p>
<h2>What the ATO can see</h2>
<ul>
<li>Your identity details linked to exchange accounts</li>
<li>Buy and sell transactions</li>
<li>Wallet addresses in some cases</li>
</ul>
<p>If your return doesn't match their data, you may get a "please explain" letter or an amended assessment with interest and penalties.</p>
<h2>How to stay safe</h2>
<p>Report accurately every year. Use crypto tax software to reconcile every exchange and wallet so your figures line up with what the ATO already holds. If your situation is complex or you've fallen behind, get a crypto-specialist registered tax agent to review it before the ATO contacts you.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "crypto-accountant-au", role: "featured" },
    ],
  },
  // ── Event-specific guides (high AI-resistance long tail) ──
  {
    slug: "how-is-defi-taxed-australia",
    title: "How Is DeFi Taxed in Australia? (ATO Rules)",
    type: "guide",
    category: "defi-tax",
    excerpt:
      "Swaps, liquidity pools, lending and wrapping all have tax consequences. Here's how the ATO treats DeFi.",
    meta_title: "How Is DeFi Taxed in Australia? ATO DeFi Tax Guide",
    meta_description:
      "How the ATO taxes DeFi in Australia: token swaps, liquidity pools, lending, wrapping and yield. Understand your CGT and income events.",
    tags: ["defi", "crypto-tax", "australia", "ato"],
    body: `<h2>DeFi is taxable — even without cashing out</h2>
<p>Most DeFi activity involves disposing of one token for another, which is a CGT event under ATO rules. You can owe tax even if you never convert back to AUD.</p>
<h2>Common DeFi events</h2>
<ul>
<li><strong>Token swaps (DEX trades)</strong> — a CGT event on the token you give up.</li>
<li><strong>Adding/removing liquidity</strong> — often treated as a disposal when you exchange tokens for LP tokens (and again on the way out). Treatment can vary, so keep detailed records.</li>
<li><strong>Lending / yield</strong> — rewards are typically ordinary income at market value when received.</li>
<li><strong>Wrapping tokens</strong> — wrapping/unwrapping may be a CGT event depending on whether beneficial ownership changes.</li>
<li><strong>Governance / reward tokens</strong> — generally income when received, then CGT on later disposal.</li>
</ul>
<h2>Why DeFi is hard to report manually</h2>
<p>A single yield-farming session can create dozens of taxable events across multiple protocols. Software that categorises on-chain DeFi automatically saves hours and reduces errors — <strong>Crypto Tax Calculator</strong> is particularly strong on complex DeFi, and <strong>Koinly</strong> covers a wide range of protocols.</p>
${DISCLAIMER}`,
    links: [
      { product: "crypto-tax-calculator", role: "hero" },
      { product: "koinly", role: "featured" },
    ],
  },
  {
    slug: "how-are-staking-rewards-taxed-australia",
    title: "How Are Staking Rewards Taxed in Australia?",
    type: "guide",
    category: "staking-tax",
    excerpt:
      "Staking rewards are ordinary income when you receive them, then a CGT asset when you sell. Here's how it works.",
    meta_title: "How Are Staking Rewards Taxed in Australia? (ATO)",
    meta_description:
      "ATO staking tax in Australia: rewards are ordinary income at market value when received, then subject to CGT on disposal. Worked example inside.",
    tags: ["staking", "crypto-tax", "australia", "ato"],
    body: `<h2>Two tax points for every staking reward</h2>
<p>The ATO treats staking rewards in two steps:</p>
<ol>
<li><strong>When you receive the reward</strong> — it's <strong>ordinary income</strong> at its AUD market value on the day. This goes in your assessable income.</li>
<li><strong>When you later sell it</strong> — it's a <strong>CGT event</strong>. Your cost base is the value you already declared as income, so you only pay CGT on the gain since then.</li>
</ol>
<h2>Worked example</h2>
<p>You receive 1 token as a staking reward when it's worth A$100 — you declare A$100 income. You later sell it for A$130 — you have a A$30 capital gain (potentially discounted if held over 12 months).</p>
<h2>This applies broadly</h2>
<p>Exchange "earn" products, validator rewards and most yield are treated the same way: income on receipt, CGT on disposal. Good software timestamps and values each reward automatically so you don't have to price hundreds of small receipts by hand.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "syla", role: "related" },
    ],
  },
  {
    slug: "how-are-crypto-airdrops-taxed-australia",
    title: "How Are Crypto Airdrops Taxed in Australia?",
    type: "guide",
    category: "airdrop-tax",
    excerpt:
      "Most airdrops are ordinary income at market value when received — but initial-allocation airdrops can differ.",
    meta_title: "How Are Airdrops Taxed in Australia? (ATO Rules)",
    meta_description:
      "ATO airdrop tax in Australia: most airdrops are ordinary income at market value on receipt, with a CGT event on later sale. Initial-allocation airdrops explained.",
    tags: ["airdrop", "crypto-tax", "australia", "ato"],
    body: `<h2>The general rule</h2>
<p>Under ATO guidance, most airdropped tokens are <strong>ordinary income</strong> at their AUD market value when you receive them. That value also becomes your cost base for a later CGT event when you sell.</p>
<h2>Initial-allocation airdrops</h2>
<p>There's an important exception: an <strong>initial allocation airdrop</strong> — where you receive a brand-new project's token as part of its first distribution and you didn't already hold a token to qualify — may <em>not</em> be ordinary income on receipt. Instead you may only face CGT when you later dispose of it (often with a nil cost base). The distinction is subtle, so document how you received each airdrop.</p>
<h2>Watch the timing trap</h2>
<p>You can be taxed on an airdrop's value at receipt even if the token later crashes to zero before you sell. Keep records of the date and AUD value of every airdrop.</p>
<h2>Make it easy</h2>
<p>Crypto tax software detects airdrops in your wallet history and values them at receipt automatically. For airdrop-heavy wallets, <strong>Koinly</strong> and <strong>Crypto Tax Calculator</strong> both handle this well.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "crypto-tax-calculator", role: "related" },
    ],
  },
  {
    slug: "how-are-nfts-taxed-australia",
    title: "How Are NFTs Taxed in Australia?",
    type: "guide",
    category: "nft-tax",
    excerpt:
      "NFTs follow the same CGT rules as other crypto — with special cases for creators and traders.",
    meta_title: "How Are NFTs Taxed in Australia? (ATO NFT Tax)",
    meta_description:
      "ATO NFT tax in Australia: buying, selling and minting NFTs. How CGT applies to collectors and when NFT income rules apply to creators and traders.",
    tags: ["nft", "crypto-tax", "australia", "ato"],
    body: `<h2>NFTs are CGT assets too</h2>
<p>For most people, NFTs are taxed like other crypto. Buying an NFT with crypto is a CGT event on the crypto you spend, and selling the NFT is a CGT event on the NFT.</p>
<h2>Collectors and investors</h2>
<ul>
<li><strong>Buying with ETH/SOL etc.</strong> — disposing of that crypto triggers CGT.</li>
<li><strong>Selling the NFT</strong> — capital gain or loss based on AUD proceeds vs cost base.</li>
<li><strong>12-month discount</strong> — may apply if you held over a year as an individual investor.</li>
</ul>
<h2>Creators and traders</h2>
<p>If you <strong>mint and sell NFTs as a business</strong> or trade them commercially, profits can be <strong>ordinary income</strong> rather than CGT, and royalties you receive are generally income. The "personal use asset" exemption rarely applies to NFTs held as investments.</p>
<h2>Records are everything</h2>
<p>NFT transactions span marketplaces and wallets and often involve gas fees. Software that reads your on-chain history and values each trade in AUD makes NFT reporting far less painful.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "crypto-tax-calculator", role: "related" },
    ],
  },
  // ── Reviews ──
  {
    slug: "koinly-review",
    title: "Koinly Review (Australia): Is It the Best ATO Crypto Tax Tool?",
    type: "review",
    category: "crypto-tax-software",
    excerpt:
      "Koinly is the most popular crypto tax tool for Australians. We cover ATO reports, DeFi/NFT support, pricing and who it's for.",
    meta_title: "Koinly Review 2026 (Australia): Features, Pricing & Verdict",
    meta_description:
      "Our Koinly review for Australian investors: ATO myTax reports, DeFi & NFT handling, exchange coverage, pricing, pros and cons, and whether it's worth it.",
    tags: ["koinly", "crypto-tax-software", "review", "australia"],
    body: `<h2>What is Koinly?</h2>
<p>Koinly is an Australian-founded crypto tax calculator that connects to 800+ exchanges and wallets, applies ATO rules, and produces a report you can drop straight into myTax or hand to your accountant. You can track your portfolio for free and only pay when you download a tax report.</p>
<h2>Where Koinly stands out</h2>
<p>Coverage and ease of use. It handles crypto-to-crypto trades, the 12-month CGT discount, staking income, airdrops, DeFi and NFTs, and its ATO-specific reports are genuinely ready to lodge. The free tracking tier lets you set everything up before paying.</p>
<h3>Pricing</h3>
<p>Free to track; paid report tiers start around A$69 per tax year and scale with your number of transactions (verify current pricing).</p>
<h2>Our verdict — 9.4/10</h2>
<p>The best all-round crypto tax tool for most Australians. If you want an Australia-only tool with built-in tax minimisation, also look at Syla; for the most complex DeFi, compare Crypto Tax Calculator.</p>
${DISCLAIMER}`,
    links: [{ product: "koinly", role: "hero" }],
  },
  {
    slug: "syla-review",
    title: "Syla Review: The Australia-Only Crypto Tax Tool",
    type: "review",
    category: "crypto-tax-software",
    excerpt:
      "Syla is built only for Australia and includes 'Lowest Tax First Out' parcel selection to cut your CGT. Full review.",
    meta_title: "Syla Review 2026: Australian Crypto Tax Software Verdict",
    meta_description:
      "Our Syla review: an Australia-only crypto tax tool with LTFO tax minimisation, ATO myTax reports, AUD pricing, pros, cons and who it's best for.",
    tags: ["syla", "crypto-tax-software", "review", "australia"],
    body: `<h2>What is Syla?</h2>
<p>Syla is crypto tax software built exclusively for Australia and ATO rules. Its standout feature is <strong>Lowest Tax First Out (LTFO)</strong> parcel selection, which chooses which parcels to dispose of in a way that legally minimises your capital gains tax.</p>
<h2>Where Syla stands out</h2>
<p>Because it only serves Australia, everything is tuned to the ATO — reports, the 12-month discount, and tax-optimised parcel selection. AUD pricing is competitive and often cheaper than global rivals for typical portfolios.</p>
<h3>Pricing</h3>
<p>Plans start around A$59 per tax year (verify current pricing).</p>
<h2>Our verdict — 9.0/10</h2>
<p>The best pick if you're Australia-only and want tax minimisation built in. If you need multi-country support or the widest integration list, Koinly is more flexible.</p>
${DISCLAIMER}`,
    links: [{ product: "syla", role: "hero" }],
  },
  {
    slug: "crypto-tax-calculator-review",
    title: "Crypto Tax Calculator Review: Best for DeFi?",
    type: "review",
    category: "crypto-tax-software",
    excerpt:
      "Crypto Tax Calculator specialises in complex DeFi and on-chain activity. Here's our Australian review.",
    meta_title: "Crypto Tax Calculator Review 2026 (Australia)",
    meta_description:
      "Crypto Tax Calculator review for Australians: DeFi and on-chain categorisation, 3,000+ integrations, ATO reports, pricing, pros and cons.",
    tags: ["crypto-tax-calculator", "crypto-tax-software", "review", "defi"],
    body: `<h2>What is Crypto Tax Calculator?</h2>
<p>Crypto Tax Calculator (CTC) is an Australian-founded tax platform known for handling complex DeFi, derivatives and on-chain activity across 3,000+ integrations, with detailed ATO reports.</p>
<h2>Where CTC stands out</h2>
<p>DeFi. If your history is full of DEX swaps, liquidity pools, lending, and obscure protocols, CTC's categorisation engine is among the best at making sense of it. It's a favourite for active on-chain users and accountants handling messy wallets.</p>
<h3>Pricing</h3>
<p>Plans start around A$99 per tax year and scale with transaction volume (verify current pricing).</p>
<h2>Our verdict — 8.9/10</h2>
<p>The best choice for heavy DeFi and on-chain users. For simpler portfolios, Koinly or Syla may be cheaper and quicker to set up.</p>
${DISCLAIMER}`,
    links: [{ product: "crypto-tax-calculator", role: "hero" }],
  },
  {
    slug: "coinledger-review",
    title: "CoinLedger Review (Australia): Simple Crypto Tax Reports",
    type: "review",
    category: "crypto-tax-software",
    excerpt:
      "CoinLedger is a fast, simple crypto tax tool with ATO report support. Is it right for Australians?",
    meta_title: "CoinLedger Review 2026 (Australia): Verdict & Pricing",
    meta_description:
      "CoinLedger review for Australian users: ease of use, ATO report export, pricing, pros and cons, and how it compares to Koinly and Syla.",
    tags: ["coinledger", "crypto-tax-software", "review", "australia"],
    body: `<h2>What is CoinLedger?</h2>
<p>CoinLedger is an easy-to-use crypto tax platform, popular globally, that supports Australian ATO report exports. It's aimed at users who want a clean, fast experience without a steep learning curve.</p>
<h2>Where CoinLedger stands out</h2>
<p>Simplicity and support. The interface is straightforward, imports are quick, and customer support is well regarded. It's a solid option for reasonably standard portfolios.</p>
<h3>Pricing</h3>
<p>Report tiers start around A$79 per tax year (verify current pricing).</p>
<h2>Our verdict — 8.4/10</h2>
<p>A good, simple choice — but as a US-first product it has fewer Australia-specific features than Koinly or Syla. If tax minimisation or complex DeFi matters to you, prefer those.</p>
${DISCLAIMER}`,
    links: [{ product: "coinledger", role: "hero" }],
  },
  // ── Comparisons & best-of ──
  {
    slug: "best-crypto-tax-software-australia",
    title: "Best Crypto Tax Software in Australia (2026, Ranked)",
    type: "guide",
    category: "crypto-tax-software",
    excerpt:
      "The best crypto tax software for Australian investors, ranked for ATO reports, DeFi support, tax minimisation and value.",
    meta_title: "Best Crypto Tax Software Australia 2026 (Ranked &amp; Tested)",
    meta_description:
      "The best crypto tax software in Australia for 2026, ranked: Koinly, Syla, Crypto Tax Calculator and CoinLedger compared on ATO reports, DeFi and price.",
    tags: ["crypto-tax-software", "australia", "best-of", "guide"],
    body: `<h2>The best crypto tax software for Australians, ranked</h2>
<p>We scored the leading tools on ATO report quality, DeFi/NFT support, tax minimisation and value for Australian investors.</p>
<h3>1. Koinly — best overall (9.4)</h3>
<p>The easiest all-rounder: huge exchange/wallet coverage, strong DeFi and NFT handling, free portfolio tracking, and ATO-ready reports. The default pick for most people.</p>
<h3>2. Syla — best Australia-only + tax minimisation (9.0)</h3>
<p>Built purely for the ATO with Lowest Tax First Out parcel selection to legally reduce your CGT. Great value in AUD.</p>
<h3>3. Crypto Tax Calculator — best for DeFi (8.9)</h3>
<p>The strongest engine for complex DeFi and on-chain activity across thousands of integrations.</p>
<h3>4. CoinLedger — simplest (8.4)</h3>
<p>Clean and fast for standard portfolios, with good support.</p>
<h2>How to choose</h2>
<p>Most Australians should start with <strong>Koinly</strong>. Choose <strong>Syla</strong> if you're Australia-only and want tax minimisation baked in, or <strong>Crypto Tax Calculator</strong> if your wallets are heavy on DeFi. For complex situations or an ATO review, consider a crypto-specialist accountant.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "related" },
      { product: "syla", role: "related" },
      { product: "crypto-tax-calculator", role: "related" },
      { product: "coinledger", role: "related" },
    ],
  },
  {
    slug: "koinly-vs-crypto-tax-calculator",
    title: "Koinly vs Crypto Tax Calculator (Australia): Which Wins?",
    type: "comparison",
    category: "crypto-tax-software",
    excerpt:
      "Koinly vs Crypto Tax Calculator for Australian investors — ease of use vs DeFi power. Here's how to choose.",
    meta_title: "Koinly vs Crypto Tax Calculator 2026 (Australia)",
    meta_description:
      "Koinly vs Crypto Tax Calculator for Australians: ATO reports, DeFi support, integrations and pricing compared, so you can pick the right tool.",
    tags: ["koinly", "crypto-tax-calculator", "comparison", "australia"],
    body: `<h2>Koinly vs Crypto Tax Calculator at a glance</h2>
<p>Both produce ATO-ready reports. The difference is focus: Koinly is the easier all-rounder, while Crypto Tax Calculator is the DeFi specialist.</p>
<h3>Ease of use</h3>
<p><strong>Koinly</strong> wins for most people — quick setup, clean interface, free tracking tier.</p>
<h3>DeFi &amp; on-chain</h3>
<p><strong>Crypto Tax Calculator</strong> wins for complex DeFi, derivatives and obscure protocols.</p>
<h3>Coverage &amp; price</h3>
<p>Koinly has very broad exchange/wallet coverage and competitive pricing; CTC's DeFi depth can be worth the premium if your history is messy.</p>
<h2>Verdict</h2>
<p>Pick <strong>Koinly</strong> if your activity is mostly buying, selling and staking. Pick <strong>Crypto Tax Calculator</strong> if you live in DeFi. Both let you import for free and only pay to download the report, so you can trial the one that reconciles your wallets best.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "vs-left" },
      { product: "crypto-tax-calculator", role: "vs-right" },
    ],
  },
  {
    slug: "koinly-vs-syla",
    title: "Koinly vs Syla: Best Crypto Tax Tool for Australians?",
    type: "comparison",
    category: "crypto-tax-software",
    excerpt:
      "Koinly's global coverage vs Syla's Australia-only tax minimisation. Which crypto tax tool should you use?",
    meta_title: "Koinly vs Syla 2026: Best Australian Crypto Tax Software",
    meta_description:
      "Koinly vs Syla for Australians: integrations and flexibility vs Australia-only tax minimisation (LTFO). ATO reports, pricing and verdict.",
    tags: ["koinly", "syla", "comparison", "australia"],
    body: `<h2>Koinly vs Syla at a glance</h2>
<p>Koinly is a flexible global tool that's very popular in Australia; Syla is built only for Australia with tax minimisation baked in.</p>
<h3>Tax minimisation</h3>
<p><strong>Syla</strong> wins with Lowest Tax First Out parcel selection designed to reduce your CGT under ATO rules.</p>
<h3>Coverage &amp; flexibility</h3>
<p><strong>Koinly</strong> wins with 800+ integrations and multi-country support if you ever need it.</p>
<h3>Price</h3>
<p>Both are competitively priced in AUD; Syla can be cheaper for typical Australian portfolios, Koinly scales with transaction count.</p>
<h2>Verdict</h2>
<p>Choose <strong>Syla</strong> if you're Australia-only and want maximum tax efficiency with minimal fuss. Choose <strong>Koinly</strong> if you want the broadest integrations, the biggest community, and a free tracking tier to start.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "vs-left" },
      { product: "syla", role: "vs-right" },
    ],
  },
];

// ── Seeding logic ──────────────────────────────────────────────────────

async function upsertSite(): Promise<string> {
  const { data: existing } = await sb.from("sites").select("id").eq("slug", SITE.slug).single();
  if (existing) {
    console.log(`  Site "${SITE.slug}" already exists (${existing.id})`);
    return existing.id;
  }
  const { data, error } = await sb
    .from("sites")
    .insert({
      slug: SITE.slug,
      name: SITE.name,
      domain: SITE.domain,
      language: SITE.language,
      direction: SITE.direction,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create site: ${error.message}`);
  console.log(`  Created site "${SITE.slug}" (${data.id})`);
  return data.id;
}

async function seedCategories(siteId: string): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const cat of categories) {
    const { data: existing } = await sb
      .from("categories")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", cat.slug)
      .single();
    if (existing) {
      ids.set(cat.slug, existing.id);
      continue;
    }
    const { data, error } = await sb
      .from("categories")
      .insert({ site_id: siteId, ...cat })
      .select("id")
      .single();
    if (error) {
      console.error(`  Failed to seed category "${cat.slug}":`, error.message);
      continue;
    }
    ids.set(cat.slug, data.id);
  }
  console.log(`  Seeded ${ids.size} categories`);
  return ids;
}

async function seedProducts(
  siteId: string,
  categoryIds: Map<string, string>,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const prod of products) {
    const { data: existing } = await sb
      .from("products")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", prod.slug)
      .single();
    if (existing) {
      ids.set(prod.slug, existing.id);
      // Keep affiliate_url and featured flags as-is, but refresh image assets
      // from the seed so logos stay in sync with the repo.
      await sb
        .from("products")
        .update({ image_url: prod.image_url ?? "", image_alt: prod.name })
        .eq("id", existing.id);
      continue;
    }
    const { category, ...rest } = prod;
    const { data, error } = await sb
      .from("products")
      .insert({
        site_id: siteId,
        category_id: categoryIds.get(category) ?? null,
        image_url: prod.image_url ?? "",
        image_alt: prod.name,
        price_currency: "AUD",
        deal_text: "",
        status: "active",
        ...rest,
      })
      .select("id")
      .single();
    if (error) {
      console.error(`  Failed to seed product "${prod.slug}":`, error.message);
      continue;
    }
    ids.set(prod.slug, data.id);
  }
  console.log(`  Seeded ${ids.size} products`);
  return ids;
}

async function seedContent(
  siteId: string,
  categoryIds: Map<string, string>,
  productIds: Map<string, string>,
) {
  let count = 0;
  for (const item of content) {
    let contentId: string;
    const { data: existing } = await sb
      .from("content")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", item.slug)
      .single();

    if (existing) {
      contentId = existing.id;
    } else {
      const { links, category, ...rest } = item;
      const { data, error } = await sb
        .from("content")
        .insert({
          site_id: siteId,
          category_id: categoryIds.get(category) ?? null,
          status: "published",
          featured_image: "",
          author: AUTHOR,
          ...rest,
        })
        .select("id")
        .single();
      if (error) {
        console.error(`  Failed to seed content "${item.slug}":`, error.message);
        continue;
      }
      contentId = data.id;
      count++;
    }

    // Link products (idempotent: ignore duplicates on the composite PK)
    for (const link of item.links) {
      const productId = productIds.get(link.product);
      if (!productId) continue;
      const { error } = await sb
        .from("content_products")
        .upsert(
          { content_id: contentId, product_id: productId, role: link.role },
          { onConflict: "content_id,product_id" },
        );
      if (error) {
        console.error(`  Failed to link "${link.product}" to "${item.slug}":`, error.message);
      }
    }
  }
  console.log(`  Seeded ${count} new content items (+ product links)`);
}

async function main() {
  console.log(`Seeding "${SITE.name}" (${SITE.domain})...\n`);

  console.log("1. Upserting site...");
  const siteId = await upsertSite();

  console.log("\n2. Seeding categories...");
  const categoryIds = await seedCategories(siteId);

  console.log("\n3. Seeding products...");
  const productIds = await seedProducts(siteId, categoryIds);

  console.log("\n4. Seeding content + product links...");
  await seedContent(siteId, categoryIds, productIds);

  console.log("\nDone! Crypto Tax AU site seeded successfully.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
