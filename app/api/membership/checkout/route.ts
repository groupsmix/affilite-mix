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

/**
 * Q4-3: Explicit tier allowlist. Only tiers in this set are accepted.
 * This replaces the dynamic `process.env[...]` lookup pattern which,
 * while safe for `process.env` (prototype-less proxy), is harder to
 * audit than a closed set. Add new tiers here when they are launched.
 *
 * audit5-#39: when `STRIPE_PRICE_MAP` is set (JSON object mapping tier
 * name → Stripe price ID), it takes precedence over the legacy
 * `STRIPE_PRICE_ID_<TIER>` env vars. Adding a new tier (e.g. `family`,
 * `lifetime`) then requires only an env-var update + adding the tier
 * to `ALLOWED_TIERS` below — no code change to the lookup function.
 */
const ALLOWED_TIERS = new Set(["insider", "pro"]);

/**
 * Parse the optional `STRIPE_PRICE_MAP` env var into a `tier → priceId`
 * record. Returns null if the var is unset, blank, or unparseable. We
 * deliberately do NOT throw on parse error — the legacy
 * `STRIPE_PRICE_ID_<TIER>` lookups remain as a safety net so a typo in
 * the JSON cannot break checkout outright.
 */
function parsePriceMap(): Record<string, string> | null {
  const raw = process.env.STRIPE_PRICE_MAP;
  if (!raw || !raw.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      // Reject non-string values to keep the lookup type-safe.
      if (typeof v !== "string" || v.length === 0) continue;
      out[k.toLowerCase()] = v;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch (err) {
    // A100-5: Log malformed STRIPE_PRICE_MAP instead of silently ignoring.
    logger.error("[checkout] STRIPE_PRICE_MAP is set but not valid JSON", {
      error: String(err),
    });
    return null;
  }
}

/** Map a requested tier to the configured Stripe price id, if any. */
function priceIdForTier(tier: string): string | undefined {
  const normalised = tier.toLowerCase();
  if (!ALLOWED_TIERS.has(normalised)) return undefined;
  // audit5-#39: prefer STRIPE_PRICE_MAP (JSON) over legacy per-tier vars.
  const map = parsePriceMap();
  if (map && map[normalised]) return map[normalised];
  // Legacy fallback — `STRIPE_PRICE_ID_INSIDER`, `STRIPE_PRICE_ID_PRO`, …
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
