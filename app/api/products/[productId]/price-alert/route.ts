import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { createPriceAlert, getPriceAlert, deactivatePriceAlert } from "@/lib/dal/price-alerts";

/**
 * POST /api/products/:productId/price-alert
 * Subscribe to a price-drop alert.
 * Body: { email: string, target_price: number, currency?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;

  // Rate limit: 10 alerts/hour per IP
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`price-alert:${ip}`, 10, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: { email?: string; target_price?: number; currency?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { email, target_price, currency } = body;

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  if (!target_price || typeof target_price !== "number" || target_price <= 0) {
    return NextResponse.json({ error: "target_price must be a positive number" }, { status: 400 });
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    // Check if already subscribed
    const existing = await getPriceAlert(productId, email);
    if (existing) {
      return NextResponse.json({
        message: "You already have an active price alert for this product",
        alert: existing,
      });
    }

    const alert = await createPriceAlert({
      product_id: productId,
      site_id: siteId,
      email,
      target_price,
      currency: currency || "USD",
    });

    return NextResponse.json({ message: "Price alert created", alert }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create price alert" }, { status: 500 });
  }
}

/**
 * DELETE /api/products/:productId/price-alert
 * Unsubscribe from a price-drop alert.
 * Body: { alert_id: string }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  await params; // consume params

  let body: { alert_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.alert_id) {
    return NextResponse.json({ error: "alert_id is required" }, { status: 400 });
  }

  try {
    await deactivatePriceAlert(body.alert_id);
    return NextResponse.json({ message: "Alert deactivated" });
  } catch {
    return NextResponse.json({ error: "Failed to deactivate alert" }, { status: 500 });
  }
}
