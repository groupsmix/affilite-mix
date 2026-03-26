/** Niche-specific metadata types for the JSONB metadata column */

export interface ArabicProductMeta {
  commission_rate?: string;
  commission_type?: "recurring" | "one-time" | "tiered";
  rating?: number;
  availability_regions?: string[];
}

export interface CryptoProductMeta {
  token_symbol?: string;
  supported_coins?: string[];
  trading_fees?: string;
  withdrawal_fees?: string;
  security_rating?: number;
  kyc_required?: boolean;
  supported_countries?: string[];
  platform_type?: "exchange" | "wallet" | "defi" | "mining" | "nft" | "tool";
}

// Future niches will add their own interfaces here.
// No schema changes needed — just add a new interface.
export type ProductMeta =
  | ArabicProductMeta
  | CryptoProductMeta
  | Record<string, unknown>;
