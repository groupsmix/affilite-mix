/** Niche-specific metadata types for the JSONB metadata column */

export interface ArabicProductMeta {
  commission_rate?: string;
  commission_type?: "recurring" | "one-time" | "tiered";
  rating?: number;
  availability_regions?: string[];
}

// Future niches will add their own interfaces here.
// No schema changes needed — just add a new interface.
export type ProductMeta = ArabicProductMeta | Record<string, unknown>;
