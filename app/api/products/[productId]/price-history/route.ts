import { NextRequest, NextResponse } from "next/server";
import { getPriceHistory } from "@/lib/dal/price-snapshots";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

/** A46#3 / A47#8: Strict UUID v4 format validation. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/products/:productId/price-history?days=90
 * Returns price history for a product.
 *
 * Security hardening (A46, A47):
 *   - UUID format validation on productId (A46#3, A47#8)
 *   - NaN guard on `days` parameter (A46#2)
 *   - Site-scoped query via x-site-id header (A47#1)
 *   - Rate limiting to prevent enumeration DoS (A46#1)
 *   - Cache-Control headers to reduce DB load
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;

  // A46#3 / A47#8: Reject non-UUID productId to prevent injection and
  // reduce noise from enumeration scans.
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: "Invalid product ID format" }, { status: 400 });
  }

  // A46#1: Rate limit public endpoint to prevent enumeration DoS.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`price-history:${ip}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get("days") || "90");
  // A46#2: Guard against NaN from non-numeric input — default to 90.
  const days = Number.isNaN(rawDays) ? 90 : Math.min(Math.max(Math.round(rawDays), 1), 365);

  try {
    // A47#1: Resolve the requesting tenant from the middleware-injected
    // x-site-id header. This ensures a product UUID belonging to tenant A
    // cannot be queried from tenant B's hostname (cross-tenant info leak).
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const snapshots = await getPriceHistory(productId, days, siteId);

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
          // A46#1: Cache for 5 minutes to reduce DB load on repeated queries.
          "Cache-Control": "public, max-age=300, s-maxage=300",
        },
      },
    );
  } catch {
    return NextResponse.json({ error: "Failed to load price history" }, { status: 500 });
  }
}
