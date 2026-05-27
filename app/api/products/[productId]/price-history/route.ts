import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/dal/price-snapshots";
import { getCurrentSite } from "@/lib/site-context";
import { checkRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/products/:productId/price-history?days=90
 * Returns price history for a product (public endpoint).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = await checkRateLimit(`price-history:${ip}`, {
    maxRequests: 60,
    windowMs: 60_000,
    failPolicy: "open" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000) || 60) } },
    );
  }

  const url = new URL(request.url);
  // Prevent NaN if days is invalid
  const daysParam = url.searchParams.get("days") || "90";
  const parsedDays = Number(daysParam);
  const days = isNaN(parsedDays) ? 90 : Math.min(parsedDays, 365);

  try {
    const site = await getCurrentSite();
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const snapshots = await getPriceHistory(productId, site.id, days);

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
    // fail-open: best-effort
    return NextResponse.json({ error: "Failed to load price history" }, { status: 500 });
  }
}
