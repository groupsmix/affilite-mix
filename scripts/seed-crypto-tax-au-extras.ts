#!/usr/bin/env tsx
// @ts-nocheck
/**
 * Crypto Tax AU extra content batch:
 *  - Appends FAQPage-friendly Q&A sections to 5 high-traffic guides.
 *  - Inserts 4 exchange-specific tax guides (CoinSpot, Swyftx, Binance AU, Crypto.com).
 *
 * Idempotent — safe to re-run. Does not duplicate FAQ blocks or exchange guides.
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

const FAQ_BLOCKS: Record<string, string> = {
  "best-crypto-tax-software-australia": `<h2>Frequently Asked Questions</h2>
<h3>Do I need crypto tax software in Australia?</h3>
<p>Not legally, but it is strongly recommended if you have more than a handful of transactions. The ATO expects accurate records for every CGT event, including crypto-to-crypto trades, staking rewards and airdrops. Software automates cost-basis calculations and ATO report generation.</p>
<h3>Can I just use a spreadsheet instead?</h3>
<p>You can, but spreadsheets become error-prone once you have hundreds of transactions across multiple wallets, DeFi protocols or chains. Crypto tax software imports exchange and wallet data automatically and applies the correct cost basis.</p>
<h3>Is crypto tax software ATO approved?</h3>
<p>The ATO does not "approve" specific software brands. However, the leading Australian tools generate the capital gains and income reports that align with ATO expectations, making it easier to lodge through myTax or with an accountant.</p>
<h3>How much does crypto tax software cost in Australia?</h3>
<p>Most tools are free to import and preview, then charge per tax year once you want to download your report. Typical plans range from roughly AUD $60 to $250 per year depending on transaction volume and features.</p>
<h3>Is it safe to connect my exchange API keys?</h3>
<p>Read-only API keys are generally safe and only let the software download transaction history, never place trades. Always enable read-only permissions and revoke access after the tax year is finalised if you prefer.</p>`,

  "software-vs-accountant-crypto-tax-australia": `<h2>Frequently Asked Questions</h2>
<h3>When should I use crypto tax software instead of an accountant?</h3>
<p>Use software when your activity is straightforward: buy-and-hold, spot trading, staking and a small number of wallets. It is faster, cheaper and sufficient for most retail returns.</p>
<h3>When do I need a crypto-specialist accountant?</h3>
<p>Hire an accountant if you have complex DeFi, business mining, an ATO review, multiple years to amend, or you want personalised tax-minimisation advice that software cannot provide.</p>
<h3>Can an accountant fix mistakes made by software?</h3>
<p>Yes. Accountants can review imported transactions, correct cost-basis errors, re-categorise income events and prepare an amended return if needed.</p>
<h3>How much does a crypto tax accountant cost in Australia?</h3>
<p>Crypto-specialist accountants typically charge between AUD $300 and $1,500 for an individual return, depending on complexity. That is often cheaper than penalties for under-reported gains.</p>
<h3>Can I use both software and an accountant?</h3>
<p>Absolutely. Many investors generate a draft report in software and then hand it to an accountant for review, advice and lodgement. This combines accuracy with professional guidance.</p>`,

  "choose-crypto-tax-accountant-australia": `<h2>Frequently Asked Questions</h2>
<h3>What qualifications should a crypto tax accountant have?</h3>
<p>Look for a registered tax agent or CPA/CA with direct experience in crypto, DeFi and ATO data-matching. Membership of a recognised professional body is a minimum.</p>
<h3>Do I need a local accountant?</h3>
<p>Not necessarily, but an Australian-registered tax agent understands local ATO deadlines, residency rules and the myTax lodgement process, which offshore accountants may not.</p>
<h3>How do I know an accountant actually understands crypto?</h3>
<p>Ask specific questions: how they handle DEX swaps, liquidity pools, airdrops, NFTs and chain-to-chain bridging. Vague answers are a red flag.</p>
<h3>Can a crypto accountant represent me in an ATO audit?</h3>
<p>Yes, a registered tax agent can communicate with the ATO on your behalf, respond to reviews and prepare voluntary disclosures if you need to amend prior years.</p>
<h3>What records should I bring to the first meeting?</h3>
<p>Bring exchange CSVs, wallet addresses, a list of DeFi protocols used, staking reward summaries and any previous tax returns you want to amend. The more detail, the more accurate the advice.</p>`,

  "record-keeping-crypto-tax-australia": `<h2>Frequently Asked Questions</h2>
<h3>What records do I need to keep for crypto tax in Australia?</h3>
<p>You need the date, type, amount, value in AUD, the other party and the purpose for every transaction. This includes trades, sales, staking rewards, airdrops, gifts and payments.</p>
<h3>How long should I keep crypto tax records?</h3>
<p>Keep records for at least five years from the date you lodge the relevant tax return. Keep them longer if you amend a return or are under ATO review.</p>
<h3>What if I lost access to an old exchange?</h3>
<p>Try to reconstruct records from bank statements, email confirmations, blockchain explorers and any downloaded statements. If records are truly lost, document your attempts and use reasonable estimates supported by evidence.</p>
<h3>Can the ATO access my exchange data?</h3>
<p>Yes. The ATO has data-matching agreements with many Australian and international exchanges and regularly compares exchange data to tax returns. Discrepancies can trigger letters or audits.</p>
<h3>Does tax software count as proper record keeping?</h3>
<p>Yes, if it accurately captures your transaction history and you retain source files (CSVs, wallet addresses and reports) for at least five years. Keep backups in case the software changes or you cancel your subscription.</p>`,

  "common-crypto-tax-mistakes-australia": `<h2>Frequently Asked Questions</h2>
<h3>Is crypto-to-crypto a taxable event in Australia?</h3>
<p>Yes. Swapping Bitcoin for Ethereum, or any crypto-to-crypto trade, is a disposal for CGT purposes and must be reported even if you never converted back to Australian dollars.</p>
<h3>Do I pay tax if I have not sold to AUD?</h3>
<p>You do not pay tax on unrealised gains while you hold. However, selling, swapping, gifting or using crypto to buy goods triggers a CGT event regardless of whether the proceeds are in AUD.</p>
<h3>What happens if I forgot to report crypto?</h3>
<p>You may be charged interest and penalties. The ATO can amend returns for up to several years. If you discover an error, consider lodging an amendment or voluntary disclosure as soon as possible.</p>
<h3>Are airdrops always taxable?</h3>
<p>Most airdrops are ordinary income when received if they were part of a promotion or held as part of an existing project. Subsequent disposals are then CGT events. The facts matter, so keep evidence of how you received the tokens.</p>
<h3>Can the ATO track my DeFi transactions?</h3>
<p>On-chain activity is publicly visible and increasingly linkable to identities via exchange deposits and withdrawals. The ATO also receives exchange data. Relying on anonymity is risky and not a defence for incorrect returns.</p>`,
};

const EXCHANGE_GUIDES = [
  {
    slug: "coinspot-tax-australia",
    title: "CoinSpot Tax Guide for Australia (ATO Rules 2026)",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "CoinSpot reports to the ATO. Learn how to download your CoinSpot tax CSV, calculate CGT and import transactions into crypto tax software.",
    body: `<h2>How the ATO sees your CoinSpot activity</h2>
<p>CoinSpot is an Australian exchange with full AUD pairs and reports transaction data to the ATO under data-matching agreements. If you buy, sell or swap crypto on CoinSpot, those events must appear in your tax return.</p>
<h2>Downloading your CoinSpot transaction history</h2>
<p>Log in to CoinSpot, open <strong>Account → Tax Reports</strong> and download the complete transaction CSV for each financial year. For a full record, also export <strong>Buy/Sell History</strong>, <strong>Swap History</strong> and <strong>Deposit/Withdrawal History</strong>.</p>
<h2>What is taxable on CoinSpot?</h2>
<ul>
<li>Selling crypto to AUD.</li>
<li>Swapping one crypto for another on CoinSpot Markets or Instant Swap.</li>
<li>Receiving staking rewards or airdrops credited to your CoinSpot wallet.</li>
<li>Gifting crypto to another wallet.</li>
</ul>
<h2>Importing CoinSpot into tax software</h2>
<p>Most Australian crypto tax tools accept the CoinSpot CSV directly. Upload the file, map the columns and verify that the closing balances match your CoinSpot wallet. If you also use other exchanges or wallets, add those so cost basis is not double-counted.</p>
<h2>Common CoinSpot tax mistakes</h2>
<ul>
<li>Reporting only the AUD summary and ignoring crypto-to-crypto swaps.</li>
<li>Forgetting staking rewards as ordinary income.</li>
<li>Using the wrong financial year date range when exporting CSVs.</li>
</ul>
${DISCLAIMER}`,
    tags: ["coinspot", "exchange", "australia", "csv"],
    links: ["koinly", "syla", "crypto-tax-calculator", "coinledger"],
  },
  {
    slug: "swyftx-tax-australia",
    title: "Swyftx Tax Guide for Australian Investors",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Swyftx users must report every disposal, swap and staking reward. Here's how to export your Swyftx data and lodge correctly with the ATO.",
    body: `<h2>Swyftx and Australian tax</h2>
<p>Swyftx is an AUSTRAC-registered Australian exchange. It issues tax reports and shares data with the ATO. Any disposal of crypto on Swyftx — including swaps and sells — is a CGT event.</p>
<h2>Exporting your Swyftx tax report</h2>
<p>In Swyftx go to <strong>Profile → Tax Reports</strong> and download the all-time transaction history. Choose CSV format with all transaction types so cost basis and fees are preserved.</p>
<h2>Which Swyftx transactions are taxable?</h2>
<ul>
<li>Selling crypto for AUD.</li>
<li>Crypto-to-crypto swaps.</li>
<li>Staking rewards distributed to your Swyftx wallet.</li>
<li>Withdrawing crypto to an external wallet is not a CGT event by itself, but sending it as a gift or to a DEX may be.</li>
</ul>
<h2>Swyftx CSV and tax software</h2>
<p>Import the Swyftx CSV into your preferred Australian crypto tax tool. Check that fees are recorded as part of the cost base or as deductible expenses depending on the transaction type. The software should reconcile the AUD market values for each disposal.</p>
<h2>Swyftx tax checklist</h2>
<ul>
<li>Export all years where you traded.</li>
<li>Tag any transfers between Swyftx and your own wallets as internal transfers.</li>
<li>Review high-volume years for wash-sale or loss-harvesting opportunities before 30 June.</li>
</ul>
${DISCLAIMER}`,
    tags: ["swyftx", "exchange", "australia", "tax-report"],
    links: ["koinly", "syla", "crypto-tax-calculator", "coinledger"],
  },
  {
    slug: "binance-australia-tax",
    title: "Binance Australia Tax Guide: ATO Reporting Made Simple",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Australian Binance users must report spot trades, futures, staking and P2P sales. Learn how to export Binance data and stay compliant.",
    body: `<h2>Binance Australia and the ATO</h2>
<p>Although Binance no longer serves AUD bank deposits from Australia, many Australians still access Binance via international accounts or hold assets there. The ATO expects you to report every taxable event regardless of which exchange you use.</p>
<h2>Exporting Binance transaction history</h2>
<p>Go to <strong>Wallet → Transaction History</strong> and request a full trade, deposit, withdrawal and staking statement. For tax purposes, request the longest date range available. Binance may take several minutes to generate the file.</p>
<h2>Taxable Binance activity for Australians</h2>
<ul>
<li>Spot trades and conversions.</li>
<li>Futures and margin trading profits (usually ordinary income if you are a trader).</li>
<li>Staking rewards, launchpool earnings and airdrops credited to your Binance wallet.</li>
<li>P2P sales to fiat or stablecoins.</li>
</ul>
<h2>Importing Binance into Australian crypto tax software</h2>
<p>Some tools connect directly to Binance by API; others require a CSV upload. Because Binance CSVs can be large and include unsupported columns, use the tool's import wizard and manually map any unrecognised transaction types.</p>
<h2>Binance futures and margin</h2>
<p>Futures and leveraged tokens are generally treated as revenue for active traders, or as CGT for investors. Keep a record of each position's open and close dates, PnL in AUD, and whether you were trading as a business.</p>
${DISCLAIMER}`,
    tags: ["binance", "exchange", "australia", "futures"],
    links: ["koinly", "syla", "crypto-tax-calculator", "coinledger"],
  },
  {
    slug: "crypto-com-tax-australia",
    title: "Crypto.com Tax in Australia: Cards, Staking & Exchanges",
    type: "guide",
    category: "crypto-tax-basics",
    excerpt:
      "Crypto.com rewards, card spending, staking and exchange trades all have ATO implications. Here's how Australian users report them.",
    body: `<h2>Crypto.com and Australian tax</h2>
<p>Crypto.com is both an exchange and a payments app. Card spending, reward distributions, staking yields and exchange trades can each trigger different tax outcomes.</p>
<h2>Exchange trades on Crypto.com</h2>
<p>Every crypto-to-crypto or crypto-to-fiat trade on the Crypto.com Exchange or App is a CGT disposal. Export your complete <strong>Transaction History</strong> from the App and Exchange separately, then merge them in your tax tool.</p>
<h2>Crypto.com card rewards and cashback</h2>
<p>Cashback received in CRO from card purchases is generally ordinary income when credited to your wallet. The ATO treats most reward programs as income unless they are small, infrequent and not convertible.</p>
<h2>Staking and Earn on Crypto.com</h2>
<p>Staking rewards, flexible earn and supercharger distributions are ordinary income at the fair market value in AUD when received. A later sale of those rewards triggers a further CGT event.</p>
<h2>Transferring between Crypto.com and external wallets</h2>
<p>Moving crypto to your own wallet is not a disposal. Sending it to someone else, swapping on a DEX, or using it to buy goods is. Keep wallet addresses so tax software can tag transfers correctly.</p>
<h2>Importing into crypto tax software</h2>
<p>Crypto.com provides CSV exports and an API. Use a read-only API if available, or export all transaction types. Manually review reward and staking categories so they are not treated as disposals.</p>
${DISCLAIMER}`,
    tags: ["crypto-com", "exchange", "australia", "card"],
    links: ["koinly", "syla", "crypto-tax-calculator", "coinledger"],
  },
];

async function main() {
  console.log("Seeding Crypto Tax AU extras...\n");

  const { data: site } = await sb.from("sites").select("id").eq("slug", SITE_SLUG).single();
  if (!site) {
    console.error(`Site "${SITE_SLUG}" not found.`);
    process.exit(1);
  }
  const siteId = site.id;

  const { data: categories } = await sb.from("categories").select("id,slug").eq("site_id", siteId);
  const categoryIds = new Map((categories ?? []).map((c) => [c.slug, c.id]));

  const { data: products } = await sb.from("products").select("id,slug").eq("site_id", siteId);
  const productIds = new Map((products ?? []).map((p) => [p.slug, p.id]));

  // 1. Append FAQ blocks to existing guides
  let faqUpdated = 0;
  for (const [slug, faqHtml] of Object.entries(FAQ_BLOCKS)) {
    const { data: row } = await sb
      .from("content")
      .select("id,body")
      .eq("site_id", siteId)
      .eq("slug", slug)
      .single();

    if (!row) {
      console.warn(`  Guide not found, skipping FAQ: ${slug}`);
      continue;
    }

    if (row.body.includes("Frequently Asked Questions")) {
      console.log(`  FAQ already present: ${slug}`);
      continue;
    }

    // Insert FAQ before the disclaimer, or append if disclaimer not found.
    const disclaimerMarker = `<p><em>General information only`;
    let newBody;
    const idx = row.body.indexOf(disclaimerMarker);
    if (idx >= 0) {
      newBody = row.body.slice(0, idx) + faqHtml + "\n" + row.body.slice(idx);
    } else {
      newBody = row.body + "\n" + faqHtml;
    }

    const { error } = await sb
      .from("content")
      .update({ body: newBody, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      console.error(`  Failed to update FAQ for ${slug}:`, error.message);
    } else {
      console.log(`  Updated FAQ: ${slug}`);
      faqUpdated++;
    }
  }

  // 2. Insert exchange-specific tax guides
  let created = 0;
  for (const item of EXCHANGE_GUIDES) {
    const { data: existing } = await sb
      .from("content")
      .select("id")
      .eq("site_id", siteId)
      .eq("slug", item.slug)
      .single();

    if (existing) {
      console.log(`  Exchange guide already exists: ${item.slug}`);
      continue;
    }

    const { data, error } = await sb
      .from("content")
      .insert({
        site_id: siteId,
        category_id: categoryIds.get(item.category) ?? null,
        slug: item.slug,
        title: item.title,
        type: item.type,
        status: "published",
        excerpt: item.excerpt,
        body: item.body,
        tags: item.tags,
        author: AUTHOR,
        meta_title: `${item.title} | Crypto Tax AU`,
        featured_image: "",
        publish_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error(`  Failed to create ${item.slug}:`, error?.message);
      continue;
    }

    const contentId = data.id;

    for (const productSlug of item.links) {
      const productId = productIds.get(productSlug);
      if (!productId) {
        console.warn(`  Product "${productSlug}" not found for ${item.slug}`);
        continue;
      }
      const { error: linkErr } = await sb
        .from("content_products")
        .upsert(
          { content_id: contentId, product_id: productId, role: "related" },
          { onConflict: "content_id,product_id" },
        );
      if (linkErr) {
        console.error(`  Failed to link ${productSlug} to ${item.slug}:`, linkErr.message);
      }
    }

    console.log(`  Created exchange guide: ${item.slug}`);
    created++;
  }

  console.log(
    `\nDone. Updated ${faqUpdated} guides with FAQs, created ${created} exchange guides.`,
  );
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
