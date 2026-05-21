import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/dal/price-snapshots";
import { getCurrentSite } from "@/lib/site-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRICE_HISTORY_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60_000,
  failPolicy: "closed" as const,
};

function parseDays(value: string | null): number {
  if (!value) return 90;
  if (!/^\d{1,3}$/.test(value)) return 90;
  const parsed = Number(value);
  return Math.min(Math.max(parsed, 1), 365);
}

/**
 * GET /api/products/:productId/price-history?days=90
 * Returns price history for a product (public endpoint).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: "Invalid product id" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`price-history:${ip}`, PRICE_HISTORY_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const url = new URL(request.url);
  const days = parseDays(url.searchParams.get("days"));

  try {
    const site = await getCurrentSite();
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    const snapshots = await getPriceHistory(productId, site.id, days);

    return NextResponse.json(
      {
        product_id: productId,
        days,
        count: snapshots.length,
        snapshots: snapshots.map((s) => ({
          price_amount: s.price_amount,
          currency: s.currency,
          source: s.source,
          scraped_at: s.scraped_at,
        })),
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Failed to load price history" }, { status: 500 });
  }
}
