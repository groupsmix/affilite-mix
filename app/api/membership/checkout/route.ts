import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getActiveMembership } from "@/lib/dal/memberships";
import { logger } from "@/lib/logger";

/**
 * POST /api/membership/checkout
 * Creates a Stripe Checkout session for the membership tier.
 * Body: { email: string, tier?: "insider" | "pro" }
 *
 * Requires STRIPE_SECRET_KEY and STRIPE_PRICE_ID_INSIDER env vars.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await checkRateLimit(`membership-checkout:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: { email?: string; tier?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.email || !body.email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    logger.error("STRIPE_SECRET_KEY not configured");
    return NextResponse.json({ error: "Payment system not configured" }, { status: 503 });
  }

  const priceId = process.env.STRIPE_PRICE_ID_INSIDER;
  if (!priceId) {
    logger.error("STRIPE_PRICE_ID_INSIDER not configured");
    return NextResponse.json({ error: "Payment system not configured" }, { status: 503 });
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    // Check if already a member
    const existing = await getActiveMembership(body.email, siteId);
    if (existing) {
      return NextResponse.json({ error: "Already an active member" }, { status: 409 });
    }

    const appUrl = process.env.APP_URL || `https://${request.headers.get("host")}`;

    // Create Stripe Checkout session via API (no SDK dependency needed)
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        mode: "subscription",
        customer_email: body.email,
        "line_items[0][price]": priceId,
        "line_items[0][quantity]": "1",
        success_url: `${appUrl}/membership/welcome?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/membership`,
        "metadata[site_id]": siteId,
        "metadata[tier]": body.tier || "insider",
        "subscription_data[metadata][site_id]": siteId,
        "subscription_data[metadata][tier]": body.tier || "insider",
      }),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      logger.error("Stripe checkout session creation failed", { error: session });
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 500 });
    }

    return NextResponse.json({ url: session.url, session_id: session.id });
  } catch (err) {
    logger.error("Membership checkout failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
