import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
import { getCurrentSite } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { captureException } from "@/lib/sentry";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/** 10 confirm requests per minute per IP */
const CONFIRM_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

/**
 * GET /api/newsletter/confirm?token=<uuid>
 * Confirms a newsletter subscription via the double opt-in token.
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
        new URL("/newsletter/confirmed?error=missing_token", request.url),
      );
    }

    const site = await getCurrentSite();
    const siteId = await resolveDbSiteId(site.id);
    const sb = await getTenantClient();

    // Find the subscriber by confirmation token, scoped to the current site
    const { data: subscriber, error: fetchError } = await sb
      .from("newsletter_subscribers")
      .select("id, status, confirmed_at")
      .eq("site_id", siteId)
      .eq("confirmation_token", token)
      .single();

    if (fetchError || !subscriber) {
      captureException(fetchError, { context: "[api/newsletter/confirm] Token lookup failed:" });
      return NextResponse.redirect(
        new URL("/newsletter/confirmed?error=invalid_token", request.url),
      );
    }

    if (subscriber.status === "active" && subscriber.confirmed_at) {
      return NextResponse.redirect(new URL("/newsletter/confirmed", request.url));
    }

    // Activate the subscription
    const { error: updateError } = await sb
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
        new URL("/newsletter/confirmed?error=update_failed", request.url),
      );
    }

    return NextResponse.redirect(new URL("/newsletter/confirmed", request.url));
  } catch (err) {
    captureException(err, { context: "[api/newsletter/confirm] GET failed:" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
