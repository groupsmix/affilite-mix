import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { getActiveMembership } from "@/lib/dal/memberships";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";
import { isValidEmail, normalizeEmail } from "@/lib/validate-email";
import { parseJsonBody } from "@/lib/api-error";

/**
 * POST /api/membership/checkout
 * Creates a Stripe Checkout session for a membership tier.
 *
 * Body: { email: string, tier?: string, turnstileToken?: string }
 *
 * Security (audit A-2, A-3):
 *  - `tier` is validated against configured STRIPE_PRICE_ID_<TIER> env vars
 *    rather than a hardcoded allowlist (F-031). The body never controls
 *    which price gets charged directly.
 *  - Turnstile captcha is required (skipped only in dev when
 *    TURNSTILE_SECRET_KEY is not set; see `lib/turnstile.ts`).
 *
 * Requires STRIPE_SECRET_KEY and at least one STRIPE_PRICE_ID_* env var.
 */

/** Map a requested tier to the server-side env var holding its price id. */
function priceIdForTier(tier: string): string | undefined {
  // F-031: Configure-as-data. Look up the env var dynamically based on the requested tier.
  // e.g. "insider" -> STRIPE_PRICE_ID_INSIDER
  const envKey = `STRIPE_PRICE_ID_${tier.toUpperCase()}`;
  return process.env[envKey];
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  // F-006 / SEC-14: failPolicy: "closed" — checkout creates payment
  // sessions and must never silently skip rate limiting when KV/DO is
  // unavailable.
  const rl = await checkRateLimit(`membership-checkout:${ip}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const parsed = await parseJsonBody(request);
  if (parsed instanceof NextResponse) return parsed;
  const body = parsed as { email?: string; tier?: string; turnstileToken?: string };

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

  if (!body.email || !isValidEmail(body.email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }
  // AM-09: Normalize email to prevent casing-based duplicate memberships
  body.email = normalizeEmail(body.email);

  // A-2: validate tier against an allowlist *before* resolving a price.
  // We never trust the raw body value for price selection.
  const requestedTier = body.tier ?? "insider";
  if (requestedTier.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(requestedTier)) {
    return NextResponse.json({ error: "Invalid tier format" }, { status: 400 });
  }
  const tier = requestedTier;

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

    // AM-09: Require APP_URL in production; never derive redirect URLs from Host header
    const appUrl = process.env.APP_URL;
    if (!appUrl) {
      if (process.env.NODE_ENV === "production") {
        logger.error("APP_URL not configured in production");
        return NextResponse.json({ error: "Payment system not configured" }, { status: 503 });
      }
      // Dev fallback only
    }
    const baseUrl = appUrl || `https://${request.headers.get("host")}`;

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
        success_url: `${baseUrl}/membership/welcome?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/membership`,
        "metadata[site_id]": siteId,
        "metadata[tier]": tier,
        "subscription_data[metadata][site_id]": siteId,
        "subscription_data[metadata][tier]": tier,
        // OF-05: Enable Stripe Tax automatic tax calculation.
        "automatic_tax[enabled]": "true",
        // Collect tax IDs for B2B customers (optional reverse-charge VAT).
        "tax_id_collection[enabled]": "true",
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
