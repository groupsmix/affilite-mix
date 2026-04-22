import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/dal/price-snapshots";

/**
 * GET /api/products/:productId/price-history?days=90
 * Returns price history for a product (public endpoint).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get("days") || "90"), 365);

  try {
    const snapshots = await getPriceHistory(productId, days);

    return NextResponse.json({
      product_id: productId,
      days,
      count: snapshots.length,
      snapshots: snapshots.map((s) => ({
        price_amount: s.price_amount,
        currency: s.currency,
        source: s.source,
        scraped_at: s.scraped_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load price history" }, { status: 500 });
  }
}
