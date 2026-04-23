import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getActiveMembership } from "@/lib/dal/memberships";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";

/**
 * POST /api/membership/checkout
 * Creates a Stripe Checkout session for a membership tier.
 *
 * Body: { email: string, tier?: "insider" | "pro", turnstileToken?: string }
 *
 * Security (audit A-2, A-3):
 *  - `tier` is validated against a fixed allowlist and mapped to a
 *    server-held STRIPE_PRICE_ID_* env var — the body never controls
 *    which price gets charged.
 *  - Turnstile captcha is required (skipped only in dev when
 *    TURNSTILE_SECRET_KEY is not set; see `lib/turnstile.ts`).
 *
 * Requires STRIPE_SECRET_KEY and at least one STRIPE_PRICE_ID_* env var.
 */

const TIER_ALLOWLIST = ["insider", "pro"] as const;
type Tier = (typeof TIER_ALLOWLIST)[number];

/** Map a validated tier to the server-side env var holding its price id. */
function priceIdForTier(tier: Tier): string | undefined {
  switch (tier) {
    case "insider":
      return process.env.STRIPE_PRICE_ID_INSIDER;
    case "pro":
      return process.env.STRIPE_PRICE_ID_PRO;
  }
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`membership-checkout:${ip}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: { email?: string; tier?: string; turnstileToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // A-3: Turnstile verification. In dev with no secret configured the
  // helper short-circuits to success; in production an unset secret is
  // treated as a failure.
  const turnstileResult = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: turnstileResult.error ?? "Captcha verification failed" },
      { status: 403 },
    );
  }

  if (!body.email || !body.email.includes("@")) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  // A-2: validate tier against an allowlist *before* resolving a price.
  // We never trust the raw body value for price selection.
  const requestedTier = body.tier ?? "insider";
  if (!TIER_ALLOWLIST.includes(requestedTier as Tier)) {
    return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
  }
  const tier = requestedTier as Tier;

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    logger.error("STRIPE_SECRET_KEY not configured");
    return NextResponse.json({ error: "Payment system not configured" }, { status: 503 });
  }

  const priceId = priceIdForTier(tier);
  if (!priceId) {
    logger.error("Stripe price id not configured for tier", { tier });
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
        "metadata[tier]": tier,
        "subscription_data[metadata][site_id]": siteId,
        "subscription_data[metadata][tier]": tier,
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
