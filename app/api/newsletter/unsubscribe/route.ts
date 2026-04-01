import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";

/** 10 unsubscribe requests per 15 minutes per IP */
const UNSUBSCRIBE_RATE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

/**
 * GET /api/newsletter/unsubscribe?token=<uuid>
 * Unsubscribes a user using their subscriber ID as token.
 *
 * POST /api/newsletter/unsubscribe
 * Body: { email, site_id }
 * Unsubscribes by email + site_id lookup.
 */
export async function GET(request: NextRequest) {
  try {
    // Rate-limit GET unsubscribe by IP
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`unsub:${ip}`, UNSUBSCRIBE_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(
        new URL("/newsletter/unsubscribed?error=missing_token", request.url),
      );
    }

    const sb = getServiceClient();

    const { error } = await sb
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed" })
      .eq("id", token);

    if (error) {
      captureException(error, { context: "[api/newsletter/unsubscribe] GET failed to update:" });
      return NextResponse.redirect(
        new URL("/newsletter/unsubscribed?error=update_failed", request.url),
      );
    }

    return NextResponse.redirect(new URL("/newsletter/unsubscribed", request.url));
  } catch (err) {
    captureException(err, { context: "[api/newsletter/unsubscribe] GET failed:" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit by IP to prevent mass-unsubscribe attacks
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`unsub:${ip}`, UNSUBSCRIBE_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
      );
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const email = ((bodyOrError.email as string) ?? "").trim().toLowerCase();
    const siteId = bodyOrError.site_id as string | undefined;

    if (!email || !siteId) {
      return NextResponse.json({ error: "email and site_id are required" }, { status: 400 });
    }

    const sb = getServiceClient();

    const { error } = await sb
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed" })
      .eq("site_id", siteId)
      .eq("email", email);

    if (error) {
      captureException(error, { context: "[api/newsletter/unsubscribe] POST failed to update:" });
      return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "You have been unsubscribed." });
  } catch (err) {
    captureException(err, { context: "[api/newsletter/unsubscribe] POST failed:" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
