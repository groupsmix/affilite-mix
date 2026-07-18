import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
import { getCurrentSite } from "@/lib/site-context";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { hashNewsletterToken, isTokenWithinExpiry } from "@/lib/newsletter-token";

/** 10 confirm requests per minute per IP.
 * SEC-16: failPolicy "closed" — confirmation tokens are bearer secrets;
 * skipping rate limiting during KV outages allows brute-force token guessing. */
const CONFIRM_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000, failPolicy: "closed" as const };

/**
 * GET /api/newsletter/confirm?token=<uuid>
 * Confirms a newsletter subscription via the double opt-in token.
 *
 * B-02: Tokens are stored as SHA-256 hashes. We hash the incoming token
 * and compare against the stored hash, so a database leak never exposes
 * raw confirmation tokens.
 */
export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`newsletter-confirm:${ip}`, CONFIRM_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(
        // nosemgrep
        new URL("/newsletter/confirmed?error=missing_token", request.url),
      );
    }

    const site = await getCurrentSite();
    const siteId = site.id; // site.id is already the resolved DB UUID
    const sb = await getTenantClient();

    // B-02: Hash the raw token to match the stored hash
    const tokenHash = await hashNewsletterToken(token);

    // Find the subscriber by hashed confirmation token, scoped to the current site
    // FIX: select created_at so we can enforce token expiry below
    const { data: subscriber, error: fetchError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: getTenantClient() is already site-scoped via RLS
      .from("newsletter_subscribers")
      .select("id, status, confirmed_at, created_at")
      .eq("site_id", siteId)
      .eq("confirmation_token", tokenHash)
      .single();

    if (fetchError || !subscriber) {
      captureException(fetchError, { context: "[api/newsletter/confirm] Token lookup failed:" });
      return NextResponse.redirect(
        // nosemgrep
        new URL("/newsletter/confirmed?error=invalid_token", request.url),
      );
    }

    if (subscriber.status === "active" && subscriber.confirmed_at) {
      return NextResponse.redirect(new URL("/newsletter/confirmed", request.url)); // nosemgrep
    }

    // FIX: Enforce token expiry. isTokenWithinExpiry() is called on the
    // unsubscribe route but was omitted here — confirmation tokens were
    // valid indefinitely, allowing old emails to activate subscriptions months later.
    if (!isTokenWithinExpiry(subscriber.created_at)) {
      return NextResponse.redirect(
        // nosemgrep
        new URL("/newsletter/confirmed?error=expired_token", request.url),
      );
    }

    // Activate the subscription
    const { error: updateError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: getTenantClient() is already site-scoped via RLS
      .from("newsletter_subscribers")
      .update({
        status: "active",
        confirmed_at: new Date().toISOString(),
        confirmation_token: null,
      })
      .eq("id", subscriber.id);

    if (updateError) {
      captureException(updateError, {
        context: "[api/newsletter/confirm] Failed to activate subscriber:",
      });
      return NextResponse.redirect(
        // nosemgrep
        new URL("/newsletter/confirmed?error=update_failed", request.url),
      );
    }

    return NextResponse.redirect(new URL("/newsletter/confirmed", request.url)); // nosemgrep
  } catch (err) {
    captureException(err, { context: "[api/newsletter/confirm] GET failed:" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
