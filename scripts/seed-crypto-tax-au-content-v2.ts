#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Additional content seed for the Crypto Tax AU site.
 *
 * Adds ~15 more ATO-focused guides, reviews and comparisons so the site
 * reaches 25-30 published pieces and covers high-intent tax-season topics.
 *
 * Idempotent — safe to run multiple times (upserts by slug).
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL.
 */

import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  realtime: { transport: ws },
});

const SITE_SLUG = "crypto-tools";
const AUTHOR = "Crypto Tax AU Editorial";

const DISCLAIMER = `<p><em>General information only, current as a guide to ATO rules — not personal tax advice. Crypto tax depends on your circumstances. Verify with the <a href="https://www.ato.gov.au/" rel="nofollow noopener" target="_blank">ATO</a> or a registered tax agent before you lodge.</em></p>`;

interface ContentSeed {
  slug: string;
  title: string;
  type: "guide" | "review" | "comparison" | "article";
  category: string;
  excerpt: string;
  meta_title: string;
  meta_description: string;
  tags: string[];
  body: string;
  links: { product: string; role: "hero" | "featured" | "related" | "vs-left" | "vs-right" }[];
}

const content: ContentSeed[] = [
  {
    slug: "crypto-tax-loss-harvesting-australia",
    title: "Crypto Tax Loss Harvesting in Australia (ATO Rules)",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Offset crypto gains by realising capital losses before 30 June. Here's how loss harvesting works under ATO rules.",
    meta_title: "Crypto Tax Loss Harvesting Australia 2026 (ATO Guide)",
    meta_description:
      "How to harvest crypto capital losses in Australia to offset gains. ATO rules, 30 June timing, wash-sale risk and software that automates it.",
    tags: ["crypto-tax", "australia", "capital-losses", "ato", "tax-planning"],
    body: `<h2>What is tax loss harvesting?</h2>
<p>Tax loss harvesting means selling assets that have dropped below your cost base to realise a <strong>capital loss</strong>, which you can use to offset capital gains from other crypto or investments. In Australia, you do this within the same financial year (1 July – 30 June).</p>
<h2>How it works for crypto</h2>
<p>Every crypto-to-crypto or crypto-to-AUD sale is a CGT event. If you sell a token for less than you paid, the difference is a capital loss. Losses first offset capital gains in the same year; any excess can be carried forward to future years.</p>
<h2>Watch the wash-sale trap</h2>
<p>The ATO can disallow a loss if you sell and rebuy the same asset quickly with the sole purpose of creating a tax loss. Wait a meaningful period, or use the proceeds differently, and document your intent. If in doubt, speak to a registered tax agent.</p>
<h2>Don't harvest just for the tax saving</h2>
<p>Only sell if it fits your portfolio strategy. A tax benefit is not a good reason to realise a loss if you still believe in the asset long term.</p>
<h2>Software makes it easy</h2>
<p>Crypto tax software such as <strong>Koinly</strong> and <strong>Syla</strong> tracks unrealised gains/losses and helps you see which parcels are underwater before 30 June.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "syla", role: "featured" },
    ],
  },
  {
    slug: "crypto-mining-tax-australia",
    title: "Crypto Mining Tax in Australia: Hobby vs Business",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Mining crypto in Australia is taxed as income or business profit. Learn how the ATO classifies miners and what you can deduct.",
    meta_title: "Crypto Mining Tax Australia 2026: Hobby vs Business",
    meta_description:
      "How crypto mining is taxed in Australia: hobby miner income vs business, deductions, GST and record keeping under ATO rules.",
    tags: ["mining", "crypto-tax", "australia", "ato", "business"],
    body: `<h2>Hobby miner or business?</h2>
<p>The ATO looks at scale, intention, repetition and whether you're carrying on an enterprise. A single GPU at home is usually a hobby; a farm, rental premises, staff or significant investment leans toward business.</p>
<h2>Hobby mining</h2>
<p>Mining rewards are generally <strong>ordinary income</strong> at their AUD market value when you receive them. You can later deduct mining-related costs when you dispose of the mined coins, as part of the cost base.</p>
<h2>Business mining</h2>
<p>If you're in business, rewards are trading stock or ordinary income, and you can claim deductions for equipment, electricity and other running costs. You may also need an ABN and to consider GST.</p>
<h2>Record keeping for miners</h2>
<p>Keep timestamps, coin prices in AUD at receipt, wallet addresses, and invoices for hardware and electricity. Mining income can be frequent and small — software that imports wallet transactions is essential.</p>
<h2>Which software handles mining?</h2>
<p><strong>Crypto Tax Calculator</strong> and <strong>Koinly</strong> both import mining-pool payouts and treat them as income at market value, then track the cost base for later disposals.</p>
${DISCLAIMER}`,
    links: [
      { product: "crypto-tax-calculator", role: "hero" },
      { product: "koinly", role: "featured" },
    ],
  },
  {
    slug: "crypto-lending-borrowing-tax-australia",
    title: "Crypto Lending & Borrowing Tax in Australia",
    type: "guide",
    category: "defi-tax",
    excerpt:
      "Lending crypto and borrowing against it both trigger ATO tax events. Here's how interest, liquidation and margin loans are treated.",
    meta_title: "Crypto Lending & Borrowing Tax Australia (ATO DeFi Guide)",
    meta_description:
      "How crypto lending and borrowing are taxed in Australia: interest income, CGT on wrapped tokens, liquidation and DeFi loans under ATO rules.",
    tags: ["defi", "lending", "crypto-tax", "australia", "ato"],
    body: `<h2>Lending crypto — interest income</h2>
<p>When you lend crypto and receive interest or reward tokens, the ATO generally treats the rewards as <strong>ordinary income</strong> at their AUD market value when received. That value also becomes your cost base.</p>
<h2>Wrapped and receipt tokens</h2>
<p>Depositing into a lending pool often gives you a receipt token (for example, a wrapped version of your asset). Exchanging your original token for the receipt token can be a CGT event because you have disposed of one asset and acquired another. Exchanging back is another CGT event.</p>
<h2>Borrowing against crypto</h2>
<p>Borrowing stablecoins or cash against your crypto is generally <strong>not</strong> a CGT event because you still own the collateral. However, if the platform liquidates your collateral to repay the loan, that is a disposal and triggers CGT.</p>
<h2>Keep every transaction</h2>
<p>Lending platforms generate many small transactions. Use DeFi-capable tax software such as <strong>Crypto Tax Calculator</strong> or <strong>Koinly</strong> to import on-chain data and categorise each event correctly.</p>
${DISCLAIMER}`,
    links: [
      { product: "crypto-tax-calculator", role: "hero" },
      { product: "koinly", role: "featured" },
    ],
  },
  {
    slug: "crypto-futures-margin-tax-australia",
    title: "Crypto Futures & Margin Trading Tax in Australia",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Futures, perpetuals and margin trading on crypto exchanges create ordinary income or capital gains. Understand how the ATO taxes each.",
    meta_title: "Crypto Futures & Margin Trading Tax Australia 2026",
    meta_description:
      "How crypto futures, perpetuals and margin trading are taxed in Australia: ordinary income vs CGT, funding fees and position close-outs under ATO rules.",
    tags: ["futures", "margin", "crypto-tax", "australia", "ato"],
    body: `<h2>Are you a trader or investor?</h2>
<p>If you trade futures and perpetuals as a business — high volume, systematic and with the intention of profit — profits are typically <strong>ordinary income</strong>. Most individuals are taxed on <strong>CGT</strong> when positions close.</p>
<h2>CGT events on margin</h2>
<p>Borrowing to trade doesn't trigger CGT, but closing a position, being liquidated, or settling in a different asset does. Gains and losses are calculated in AUD at the time of the event.</p>
<h2>Funding and margin fees</h2>
<p>Funding fees, borrow interest and fees can generally be included in your cost base (for CGT) or claimed as a deduction (if trading as business). Keep a record of every fee.</p>
<h2>Use software that imports derivatives</h2>
<p>Not all tax tools handle futures well. <strong>Crypto Tax Calculator</strong> and <strong>Koinly</strong> support many exchange CSVs and can categorise margin and derivative transactions.</p>
${DISCLAIMER}`,
    links: [
      { product: "crypto-tax-calculator", role: "hero" },
      { product: "koinly", role: "featured" },
    ],
  },
  {
    slug: "crypto-gifts-donations-tax-australia",
    title: "Crypto Gifts & Donations Tax in Australia",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Gifting crypto is usually a CGT event. Donating to a DGR charity may give you a tax deduction. Here's what the ATO says.",
    meta_title: "Crypto Gifts & Donations Tax Australia (ATO Rules)",
    meta_description:
      "How gifting crypto is taxed in Australia: CGT on gifts, tax deductions for DGR charity donations, and records to keep under ATO rules.",
    tags: ["gifts", "donations", "crypto-tax", "australia", "ato"],
    body: `<h2>Gifting crypto is a disposal</h2>
<p>When you gift crypto to a friend, family member or anyone else, the ATO treats it as a <strong>CGT event</strong>. You are deemed to have received the market value of the crypto at the time of the gift, and your gain or loss is calculated against your cost base.</p>
<h2>Donating crypto to a DGR charity</h2>
<p>If the recipient is a <strong>Deductible Gift Recipient (DGR)</strong>, you may be able to claim a tax deduction. The deduction is usually the market value of the crypto at the time of donation. You also need to disregard any capital gain or loss for donations of crypto to DGRs in some cases — check current ATO guidance.</p>
<h2>Gifts you receive</h2>
<p>If you receive crypto as a gift, your cost base is the market value at the time you received it. Keep evidence of that value, because it sets your cost base for a future CGT event.</p>
<h2>Records to keep</h2>
<p>Document the date, recipient wallet address or charity ABN, AUD market value, and your cost base. <strong>Koinly</strong> can tag gifts and donations so they appear correctly in your tax report.</p>
${DISCLAIMER}`,
    links: [{ product: "koinly", role: "hero" }],
  },
  {
    slug: "record-keeping-crypto-tax-australia",
    title: "Crypto Tax Record Keeping: ATO Requirements",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "The ATO expects you to keep crypto transaction records for 5 years. Here's exactly what to keep and how software helps.",
    meta_title: "Crypto Tax Record Keeping Australia: ATO Requirements",
    meta_description:
      "ATO record-keeping requirements for crypto in Australia: dates, AUD values, fees, wallets and exchanges. How crypto tax software automates it.",
    tags: ["record-keeping", "crypto-tax", "australia", "ato"],
    body: `<h2>What records you must keep</h2>
<p>For every crypto transaction you need: the date, what was transacted, the value in AUD, who the other party was (or if it was a wallet-to-wallet transfer), and fees paid. The ATO requires you to keep these records for at least 5 years.</p>
<h2>Types of transactions to track</h2>
<ul>
<li>Buy and sell orders on Australian and international exchanges.</li>
<li>Crypto-to-crypto trades and DeFi swaps.</li>
<li>Staking rewards, airdrops, mining income and interest.</li>
<li>Wallet-to-wallet transfers between your own addresses.</li>
<li>Gifts, donations and personal use payments.</li>
</ul>
<h2>Don't rely on exchange CSVs alone</h2>
<p>Exchanges may close, limit download history or report in USD. Back up your data regularly and use software that stores a central record across wallets and chains.</p>
<h2>How software helps</h2>
<p><strong>Koinly</strong> and <strong>Syla</strong> import exchange and wallet histories, calculate AUD values at the time of each event, and keep an auditable report. This is the easiest way to stay ATO-compliant.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "syla", role: "featured" },
    ],
  },
  {
    slug: "common-crypto-tax-mistakes-australia",
    title: "7 Common Crypto Tax Mistakes Australians Make",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Avoid penalties and amended assessments by steering clear of these ATO crypto tax mistakes.",
    meta_title: "Common Crypto Tax Mistakes in Australia (ATO Penalties)",
    meta_description:
      "The most common crypto tax mistakes Australians make: ignoring crypto-to-crypto trades, missing airdrops, wrong cost base and more. ATO penalties explained.",
    tags: ["crypto-tax", "australia", "ato", "mistakes", "penalties"],
    body: `<h2>1. Forgetting crypto-to-crypto trades</h2>
<p>Swapping BTC for ETH is a CGT event, even if you never touch AUD. Many investors only report cash-outs and get caught by ATO data matching.</p>
<h2>2. Ignoring airdrops and staking rewards</h2>
<p>Airdrops and staking rewards are usually ordinary income at receipt. If you don't record them, your cost base and income will both be wrong.</p>
<h2>3. Guessing the cost base</h2>
<p>Your cost base includes the purchase price plus eligible fees. Use FIFO or the specific-identification method where allowed, and be consistent.</p>
<h2>4. Missing the 12-month discount</h2>
<p>If you hold an asset for more than 12 months as an individual, you may get a 50% CGT discount. Good software tracks holding periods automatically.</p>
<h2>5. Forgetting transfer fees</h2>
<p>Transfer and network fees can be added to your cost base in some cases. Keep records rather than ignoring them.</p>
<h2>6. Not declaring foreign exchange gains</h2>
<p>If you trade on USD or USDT pairs, the AUD/USD movement can create separate forex considerations for larger balances.</p>
<h2>7. Lodge-and-hope instead of review</h2>
<p>If your history is complex, have a crypto-specialist accountant or tax agent review it before lodging. The cost is far less than ATO penalties and interest.</p>
<h2>Fix it before the ATO contacts you</h2>
<p>Use <strong>Koinly</strong> to reconcile all transactions, or speak to a crypto tax accountant if you have years to catch up.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "crypto-accountant-au", role: "featured" },
    ],
  },
  {
    slug: "amend-prior-year-crypto-tax-australia",
    title: "How to Amend a Prior Year Crypto Tax Return in Australia",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Forgot to report crypto in a previous year? You can amend your tax return. Here's how to do it and reduce penalties.",
    meta_title: "Amend Prior Year Crypto Tax Return Australia",
    meta_description:
      "How to amend a previous Australian tax return to include crypto. ATO amendment process, time limits, penalties and how to reduce them.",
    tags: ["crypto-tax", "australia", "ato", "amendment", "penalties"],
    body: `<h2>You can amend your tax return</h2>
<p>If you didn't report crypto gains, income or losses in a prior year, you can request an amendment through myTax, your tax agent or a voluntary disclosure. The sooner you correct it, the lower the penalties.</p>
<h2>Time limits</h2>
<p>Individual taxpayers generally have <strong>two years</strong> from the date of the original notice of assessment to amend a return. Some exceptions apply for fraud or evasion.</p>
<h2>What you'll need</h2>
<ul>
<li>A complete history of the missing crypto transactions for the year.</li>
<li>AUD market values at the time of each event.</li>
<li>Records of fees and exchange costs.</li>
</ul>
<h2>Penalties and interest</h2>
<p>The ATO may apply shortfall interest and penalties, but these are often reduced if you make a voluntary disclosure before they contact you. A registered tax agent or accountant can help prepare a disclosure and negotiate the best outcome.</p>
<h2>Get it right</h2>
<p>Generate an ATO-ready report with <strong>Koinly</strong> or <strong>Syla</strong>, or work with a crypto tax accountant to prepare amendments across multiple years.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "crypto-accountant-au", role: "featured" },
    ],
  },
  {
    slug: "ato-crypto-audit-australia",
    title: "ATO Crypto Tax Audit & Review: What to Do",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "The ATO is writing to crypto investors whose returns don't match exchange data. Here's how to respond.",
    meta_title: "ATO Crypto Tax Audit Australia: What to Do",
    meta_description:
      "How to respond to an ATO crypto tax audit or review in Australia: data matching, letters, evidence and when to involve a tax agent.",
    tags: ["ato", "audit", "crypto-tax", "australia", "penalties"],
    body: `<h2>Why the ATO contacts crypto users</h2>
<p>The ATO receives data from Australian exchanges and matches it against tax returns. If your reported income or gains look too low, or if you didn't lodge at all, you may receive a letter asking you to explain or amend.</p>
<h2>Types of ATO contact</h2>
<ul>
<li><strong>Pre-filled data letter</strong> — shows estimated income or disposals and asks you to check.</li>
<li><strong>Review</strong> — a deeper look at your crypto activity for a year.</li>
<li><strong>Audit</strong> — formal examination with document requests and potential penalties.</li>
</ul>
<h2>Don't ignore it</h2>
<p>Ignoring an ATO letter leads to default assessments, penalties and interest. Respond by the due date, even if it's just to ask for more time.</p>
<h2>Gather evidence</h2>
<p>Prepare exchange statements, wallet addresses, transaction histories and a clear calculation of gains, losses and income. Crypto tax software can produce a report the ATO will accept as evidence.</p>
<h2>When to get help</h2>
<p>If the amounts are large or you have multiple years to amend, involve a crypto-specialist registered tax agent. They can manage the ATO correspondence and minimise penalties.</p>
${DISCLAIMER}`,
    links: [
      { product: "crypto-accountant-au", role: "hero" },
      { product: "koinly", role: "featured" },
    ],
  },
  {
    slug: "choose-crypto-tax-accountant-australia",
    title: "How to Choose a Crypto Tax Accountant in Australia",
    type: "guide",
    category: "crypto-accountants",
    excerpt:
      "Not every accountant understands DeFi, NFTs and on-chain activity. Here's what to look for in an Australian crypto tax specialist.",
    meta_title: "How to Choose a Crypto Tax Accountant in Australia",
    meta_description:
      "What to look for in an Australian crypto tax accountant: DeFi/NFT experience, registered tax agent status, pricing and red flags.",
    tags: ["crypto-accountant", "australia", "crypto-tax", "ato"],
    body: `<h2>Look for a registered tax agent</h2>
<p>Only <strong>registered tax agents</strong> can legally lodge tax returns on your behalf in Australia. Check the Tax Practitioners Board register before you engage anyone.</p>
<h2>Crypto experience matters</h2>
<p>Ask specifically about DeFi, staking, airdrops, NFTs and cross-chain transactions. A generalist accountant may struggle with on-chain records and hundreds of small transactions.</p>
<h2>What they should ask for</h2>
<ul>
<li>Exchange API keys or CSV exports for all accounts you used.</li>
<li>Wallet addresses across all chains.</li>
<li>Any mining, lending, airdrop or DeFi activity.</li>
<li>Prior-year notices of assessment if you need amendments.</li>
</ul>
<h2>Pricing</h2>
<p>Crypto tax work ranges from a simple software-assisted return to complex multi-year reviews. Get an estimate based on transaction count, not just portfolio value.</p>
<h2>How we can help</h2>
<p>We can connect you with an Australian registered tax agent who specialises in crypto. Use the <strong>Find a Crypto Tax Accountant</strong> referral and get your situation reviewed before tax deadlines.</p>
${DISCLAIMER}`,
    links: [
      { product: "crypto-accountant-au", role: "hero" },
      { product: "koinly", role: "featured" },
    ],
  },
  {
    slug: "software-vs-accountant-crypto-tax-australia",
    title: "Crypto Tax Software vs Accountant: Which Do You Need?",
    type: "guide",
    category: "crypto-tax-software",
    excerpt:
      "Software is cheap and fast; an accountant gives advice and handles audits. Here's how to decide for your crypto return.",
    meta_title: "Crypto Tax Software vs Accountant Australia: Which Do You Need?",
    meta_description:
      "Crypto tax software vs accountant in Australia: when to use each, cost, complexity and when you need both for ATO lodgement.",
    tags: ["crypto-tax-software", "accountant", "australia", "ato"],
    body: `<h2>When software is enough</h2>
<p>If your activity is mostly buying, selling and staking on a few exchanges, crypto tax software can generate an ATO-ready report in minutes. You or your regular accountant can then lodge it.</p>
<h2>When you need an accountant</h2>
<ul>
<li>Heavy DeFi, NFT or cross-chain activity.</li>
<li>You trade as a business or run a fund.</li>
<li>You need tax planning or CGT optimisation.</li>
<li>You have prior-year amendments or an ATO review.</li>
</ul>
<h2>The hybrid approach</h2>
<p>Many people use software to reconcile transactions and then hand the report to a crypto-savvy accountant. This saves billable hours and gives the accountant clean data to work from.</p>
<h2>Cost comparison</h2>
<p>Software usually costs A$60–A$200 per year. A crypto accountant may charge A$300–A$2,000+ depending on complexity. An audit or multi-year amendment is more expensive, so prevention is cheaper.</p>
<h2>Bottom line</h2>
<p>Start with <strong>Koinly</strong> or <strong>Syla</strong>. If your situation is complex, get a referral to a crypto tax accountant.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "hero" },
      { product: "syla", role: "featured" },
      { product: "crypto-accountant-au", role: "related" },
    ],
  },
  {
    slug: "coinpanda-review-australia",
    title: "Coinpanda Review 2026 (Australia): Verdict & Pricing",
    type: "review",
    category: "crypto-tax-software",
    excerpt:
      "Coinpanda supports 2,400+ integrations and ATO myTax reports. Is it a good choice for Australian crypto investors?",
    meta_title: "Coinpanda Review 2026 (Australia): Verdict & Pricing",
    meta_description:
      "Coinpanda review for Australian investors: 2,400+ integrations, DeFi/NFT support, ATO myTax reports, pricing, pros and cons.",
    tags: ["coinpanda", "crypto-tax-software", "review", "australia"],
    body: `<h2>What is Coinpanda?</h2>
<p>Coinpanda is a global crypto tax platform with 2,400+ exchange, wallet and blockchain integrations. It supports DeFi, NFTs and derivatives, and produces ATO-ready myTax reports for Australia.</p>
<h2>Where Coinpanda stands out</h2>
<p>Breadth. The integration list is large, the DeFi categorisation is solid, and the Australian tax report format is available. It's a strong option if you use many exchanges or chains.</p>
<h3>Pricing</h3>
<p>Free to track; paid report tiers scale with transaction count. Verify current pricing on their site.</p>
<h2>Our verdict — 8.7/10</h2>
<p>A solid all-rounder, especially if you need very broad coverage. For pure Australia-only tax minimisation, Syla is stronger; for the most complex DeFi, Crypto Tax Calculator may be deeper.</p>
${DISCLAIMER}`,
    links: [{ product: "coinpanda", role: "hero" }],
  },
  {
    slug: "koinly-vs-cointracking-australia",
    title: "Koinly vs CoinTracking (Australia): Which Wins?",
    type: "comparison",
    category: "crypto-tax-software",
    excerpt:
      "Koinly is easier to use; CoinTracking has deeper analytics and portfolio tools. Which is better for your Australian crypto tax?",
    meta_title: "Koinly vs CoinTracking 2026 (Australia)",
    meta_description:
      "Koinly vs CoinTracking for Australians: ease of use, ATO reports, DeFi/NFT support, pricing and which tool to choose.",
    tags: ["koinly", "cointracking", "comparison", "australia"],
    body: `<h2>Koinly vs CoinTracking at a glance</h2>
<p>Koinly is built for simplicity and speed; CoinTracking is a veteran platform with powerful reporting and analytics for traders who want granular control.</p>
<h3>Ease of use</h3>
<p><strong>Koinly</strong> wins. Its setup is quick, the UI is clean, and it handles most Australian investor needs out of the box.</p>
<h3>Analytics and reporting depth</h3>
<p><strong>CoinTracking</strong> wins for traders who want portfolio analytics, performance charts and tax optimisation tools beyond a simple tax report.</p>
<h3>ATO readiness</h3>
<p>Both produce reports that can be used for Australian tax lodgement, but <strong>Koinly</strong> has a more streamlined ATO-specific export and larger local user base.</p>
<h2>Verdict</h2>
<p>Most Australians should start with <strong>Koinly</strong>. Choose <strong>CoinTracking</strong> if you want a long-standing platform with advanced analytics and don't mind a steeper learning curve.</p>
${DISCLAIMER}`,
    links: [
      { product: "koinly", role: "vs-left" },
      { product: "cointracking", role: "vs-right" },
    ],
  },
  {
    slug: "syla-vs-coinledger-australia",
    title: "Syla vs CoinLedger (Australia): Which Wins?",
    type: "comparison",
    category: "crypto-tax-software",
    excerpt:
      "Syla is Australia-only with tax minimisation; CoinLedger is simple and global. Which is right for your return?",
    meta_title: "Syla vs CoinLedger 2026 (Australia): Best Crypto Tax Tool?",
    meta_description:
      "Syla vs CoinLedger for Australian investors: Australia-only tax minimisation vs simple global reporting. ATO reports, pricing and verdict.",
    tags: ["syla", "coinledger", "comparison", "australia"],
    body: `<h2>Syla vs CoinLedger at a glance</h2>
<p>Syla is built only for Australia and focuses on legally reducing your CGT. CoinLedger is a fast, simple global tool with ATO export support.</p>
<h3>Tax optimisation</h3>
<p><strong>Syla</strong> wins. Lowest Tax First Out parcel selection is designed to minimise your Australian capital gains tax.</p>
<h3>Simplicity</h3>
<p><strong>CoinLedger</strong> wins for a clean, no-frills experience. It's great for straightforward portfolios.</p>
<h3>Australia-specific features</h3>
<p><strong>Syla</strong> is purpose-built for the ATO and priced in AUD. CoinLedger exports ATO-compatible reports but is US-first.</p>
<h2>Verdict</h2>
<p>Choose <strong>Syla</strong> if you want Australia-only tax minimisation. Choose <strong>CoinLedger</strong> if you value simplicity and a modern interface over local tax optimisation.</p>
${DISCLAIMER}`,
    links: [
      { product: "syla", role: "vs-left" },
      { product: "coinledger", role: "vs-right" },
    ],
  },
  {
    slug: "coinledger-vs-crypto-tax-calculator-australia",
    title: "CoinLedger vs Crypto Tax Calculator (Australia): Which Wins?",
    type: "comparison",
    category: "crypto-tax-software",
    excerpt:
      "CoinLedger is simple; Crypto Tax Calculator is built for DeFi. Compare features, pricing and the right pick for Australian users.",
    meta_title: "CoinLedger vs Crypto Tax Calculator 2026 (Australia)",
    meta_description:
      "CoinLedger vs Crypto Tax Calculator for Australians: simplicity vs DeFi power, ATO reports, pricing and which tool to choose.",
    tags: ["coinledger", "crypto-tax-calculator", "comparison", "australia"],
    body: `<h2>CoinLedger vs Crypto Tax Calculator at a glance</h2>
<p>CoinLedger is built for ease of use; Crypto Tax Calculator is built for complex on-chain activity and DeFi.</p>
<h3>Ease of use</h3>
<p><strong>CoinLedger</strong> wins. The interface is clean, imports are fast, and it's easy for standard portfolios.</p>
<h3>DeFi and on-chain</h3>
<p><strong>Crypto Tax Calculator</strong> wins. It handles DEX swaps, liquidity pools, lending and obscure protocols better than most tools.</p>
<h3>ATO reporting</h3>
<p>Both support Australian tax reports. Crypto Tax Calculator is often preferred by accountants handling messy DeFi wallets; CoinLedger is fine for simpler returns.</p>
<h2>Verdict</h2>
<p>Pick <strong>CoinLedger</strong> if you want the simplest workflow. Pick <strong>Crypto Tax Calculator</strong> if your wallets are full of DeFi and you need deep categorisation.</p>
${DISCLAIMER}`,
    links: [
      { product: "coinledger", role: "vs-left" },
      { product: "crypto-tax-calculator", role: "vs-right" },
    ],
  },
];

async function main() {
  console.log(`Seeding additional content for Crypto Tax AU...\n`);

  const { data: site } = await sb.from("sites").select("id").eq("slug", SITE_SLUG).single();
  if (!site) {
    console.error(`Site "${SITE_SLUG}" not found. Run the main seed script first.`);
    process.exit(1);
  }
  const siteId = site.id;

  const { data: categories } = await sb.from("categories").select("id,slug").eq("site_id", siteId);
  const categoryIds = new Map(
    ((categories ?? []) as { id: string; slug: string }[]).map((c) => [c.slug, c.id]),
  );

  const { data: products } = await sb.from("products").select("id,slug").eq("site_id", siteId);
  const productIds = new Map(
    ((products ?? []) as { id: string; slug: string }[]).map((p) => [p.slug, p.id]),
  );

  let created = 0;
  for (const item of content) {
    const { data: existing } = await sb
      .from("content")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", item.slug)
      .single();

    let contentId: string;
    if (existing) {
      contentId = existing.id;
      console.log(`  Skipping existing: ${item.slug}`);
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
        console.error(`  Failed to seed "${item.slug}":`, error.message);
        continue;
      }
      contentId = data.id;
      created++;
      console.log(`  Created: ${item.slug}`);
    }

    for (const link of item.links) {
      const productId = productIds.get(link.product);
      if (!productId) {
        console.warn(`  Product "${link.product}" not found for "${item.slug}"`);
        continue;
      }
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

  console.log(`\nDone. Created ${created} new content items.`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
