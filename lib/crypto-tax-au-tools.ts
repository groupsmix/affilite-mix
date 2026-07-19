/**
 * Static tool data for the Crypto Tax AU tenant.
 *
 * These support the comparison matrix, the ATO CGT calculator and the
 * programmatic exchange-to-software sync-guide pages. Keeping the data in
 * one place makes the tools easy to update without touching UI code.
 */

export interface CryptoTaxProductFeatures {
  pricing: string;
  atoReport: string;
  integrations: string;
  defiNft: string;
  freeTier: string;
  support: string;
  bestFor: string;
  subScores: {
    features: number;
    pricing: number;
    support: number;
    ato: number;
  };
}

export type ComparableFeatureKey = keyof Omit<CryptoTaxProductFeatures, "subScores">;

export const COMPARISON_FEATURES: {
  key: ComparableFeatureKey;
  label: string;
}[] = [
  { key: "pricing", label: "Pricing" },
  { key: "atoReport", label: "ATO myTax report" },
  { key: "integrations", label: "Exchange & wallet coverage" },
  { key: "defiNft", label: "DeFi & NFT support" },
  { key: "freeTier", label: "Free tier" },
  { key: "support", label: "Customer support" },
  { key: "bestFor", label: "Best for" },
];

export const CRYPTO_TAX_PRODUCT_FEATURES: Record<string, CryptoTaxProductFeatures> = {
  koinly: {
    pricing: "Free tracking; from A$69/yr to file",
    atoReport: "Yes — ATO myTax-ready",
    integrations: "800+ exchanges & wallets",
    defiNft: "Strong",
    freeTier: "Unlimited portfolio tracking",
    support: "Chat + email",
    bestFor: "Most Australian investors",
    subScores: { features: 9.2, pricing: 8.5, support: 8.8, ato: 9.5 },
  },
  syla: {
    pricing: "From A$59/yr",
    atoReport: "Yes — built for ATO",
    integrations: "Major AU + global exchanges",
    defiNft: "Good",
    freeTier: "No",
    support: "Email + knowledge base",
    bestFor: "Australia-only tax minimisation",
    subScores: { features: 8.0, pricing: 9.0, support: 7.5, ato: 9.2 },
  },
  "crypto-tax-calculator": {
    pricing: "From A$99/yr",
    atoReport: "Yes — detailed ATO reports",
    integrations: "3,000+",
    defiNft: "Excellent",
    freeTier: "No",
    support: "Email + chat",
    bestFor: "Complex DeFi / on-chain users",
    subScores: { features: 9.6, pricing: 7.0, support: 8.0, ato: 9.0 },
  },
  coinledger: {
    pricing: "From ~A$79/yr",
    atoReport: "Yes — ATO export",
    integrations: "Large global list",
    defiNft: "Moderate",
    freeTier: "No",
    support: "Chat + email (rated highly)",
    bestFor: "Easy UX & support",
    subScores: { features: 8.2, pricing: 8.0, support: 9.2, ato: 8.0 },
  },
  cointracking: {
    pricing: "Free tier; paid from ~A$150/yr",
    atoReport: "Yes — extensive reports",
    integrations: "Major exchanges + CSV",
    defiNft: "Moderate",
    freeTier: "Up to 100 transactions",
    support: "Email + forum",
    bestFor: "Power users & analytics",
    subScores: { features: 9.0, pricing: 6.5, support: 7.0, ato: 8.5 },
  },
  coinpanda: {
    pricing: "Free 25 tx; from US$79/yr",
    atoReport: "Yes — 65+ countries incl. AU",
    integrations: "2,400+",
    defiNft: "Strong",
    freeTier: "25 transactions",
    support: "Chat + email",
    bestFor: "Multi-country users",
    subScores: { features: 8.8, pricing: 8.0, support: 8.0, ato: 8.8 },
  },
};

export interface SyncGuideData {
  exchangeKey: string;
  exchangeName: string;
  softwareKey: string;
  softwareName: string;
  steps: string[];
  notes: string;
  ctaProductSlug: string;
}

export const SYNC_EXCHANGES = [
  { key: "coinspot", name: "CoinSpot" },
  { key: "swyftx", name: "Swyftx" },
  { key: "binance-australia", name: "Binance Australia" },
  { key: "crypto-com", name: "Crypto.com" },
] as const;

export const SYNC_SOFTWARE = [
  { key: "koinly", name: "Koinly" },
  { key: "syla", name: "Syla" },
  { key: "coinledger", name: "CoinLedger" },
  { key: "cointracking", name: "CoinTracking" },
  { key: "crypto-tax-calculator", name: "Crypto Tax Calculator" },
  { key: "coinpanda", name: "Coinpanda" },
] as const;

export type SyncExchangeKey = (typeof SYNC_EXCHANGES)[number]["key"];
export type SyncSoftwareKey = (typeof SYNC_SOFTWARE)[number]["key"];

function exchangeApiInstructions(exchange: SyncExchangeKey): string {
  switch (exchange) {
    case "coinspot":
      return "Log in to CoinSpot → My Account → API → Create a new API key. Enable 'Read' permissions only. Copy the API key and secret.";
    case "swyftx":
      return "In Swyftx, go to Profile → API Keys → Generate new key. Select 'Read' permissions and copy the key and secret.";
    case "binance-australia":
      return "Log in to Binance Australia → Account → API Management → Create API. Enable 'Read' only and, if offered, restrict the key to your IP. Copy the API key and secret.";
    case "crypto-com":
      return "Crypto.com App does not offer an API. Use the Crypto.com Exchange at exchange.crypto.com: go to Account → API Keys → Create, select 'Read'. Alternatively, export a CSV statement from the App or Exchange.";
  }
}

function softwareImportInstructions(software: SyncSoftwareKey, exchangeName: string): string {
  switch (software) {
    case "koinly":
      return `In Koinly, go to Wallets → Add Wallet → search for "${exchangeName}". Choose API or CSV and paste your credentials / upload the file, then sync and review.`;
    case "syla":
      return `In Syla, go to Data sources → Add data source → choose "${exchangeName}". Paste the API key and secret, or upload the CSV.`;
    case "coinledger":
      return `In CoinLedger, go to Import → Add Account → search "${exchangeName}". Connect via API or upload the CSV.`;
    case "cointracking":
      return `In CoinTracking, go to Enter Coins → Exchange Import (API) or CSV Import, select "${exchangeName}" and paste your API credentials or upload the file.`;
    case "crypto-tax-calculator":
      return `In Crypto Tax Calculator, go to Import Data → Add Source → search "${exchangeName}". Select API or CSV and follow the prompts.`;
    case "coinpanda":
      return `In Coinpanda, go to Wallets → Add Wallet → search "${exchangeName}". Add the API key or upload the CSV.`;
  }
}

function softwareNotes(software: SyncSoftwareKey): string {
  switch (software) {
    case "koinly":
      return "Koinly will auto-label transfers between your own wallets. Review 'unknown' transactions so they are not misclassified.";
    case "syla":
      return "Syla applies Australian tax logic (including LTFO) automatically. Run the tax report before lodging.";
    case "coinledger":
      return "CoinLedger is global-first; double-check that the ATO report settings are selected before export.";
    case "cointracking":
      return "CoinTracking has powerful reporting but a steeper UI. Use their 'Audit' view to find unmatched deposits/withdrawals.";
    case "crypto-tax-calculator":
      return "Crypto Tax Calculator excels at DeFi. Manually review any uncategorised on-chain transactions.";
    case "coinpanda":
      return "Coinpanda covers 65+ countries; confirm the report country is set to Australia before filing.";
  }
}

export function getSyncGuide(exchange: SyncExchangeKey, software: SyncSoftwareKey): SyncGuideData {
  const exchangeName = SYNC_EXCHANGES.find((e) => e.key === exchange)!.name;
  const softwareName = SYNC_SOFTWARE.find((s) => s.key === software)!.name;

  return {
    exchangeKey: exchange,
    exchangeName,
    softwareKey: software,
    softwareName,
    steps: [
      exchangeApiInstructions(exchange),
      softwareImportInstructions(software, exchangeName),
      `Map any transactions that ${softwareName} could not auto-categorise (transfers between your own wallets, airdrops, staking rewards).`,
      `Generate your ATO tax report in ${softwareName} and review the capital gains summary.`,
      `Download the myTax-compatible file or PDF, or send it to your accountant to lodge.`,
    ],
    notes: softwareNotes(software),
    ctaProductSlug: software,
  };
}

export function getAllSyncGuideParams(): {
  exchange: SyncExchangeKey;
  software: SyncSoftwareKey;
}[] {
  const params: { exchange: SyncExchangeKey; software: SyncSoftwareKey }[] = [];
  for (const exchange of SYNC_EXCHANGES) {
    for (const software of SYNC_SOFTWARE) {
      params.push({ exchange: exchange.key, software: software.key });
    }
  }
  return params;
}

export function parseSyncParams(
  exchange: string,
  software: string,
): { exchange: SyncExchangeKey; software: SyncSoftwareKey } | null {
  const isExchange = SYNC_EXCHANGES.some((e) => e.key === exchange);
  const isSoftware = SYNC_SOFTWARE.some((s) => s.key === software);
  if (!isExchange || !isSoftware) return null;
  return { exchange: exchange as SyncExchangeKey, software: software as SyncSoftwareKey };
}
