import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

/** 10 unsubscribe requests per 15 minutes per IP */
const UNSUBSCRIBE_RATE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

/**
 * GET /api/newsletter/unsubscribe?token=<uuid>
 * Unsubscribes a user using their dedicated unsubscribe_token (not the row id).
 *
 * POST /api/newsletter/unsubscribe
 * Body: { email, unsubscribe_token }
 * Requires the per-subscriber unsubscribe_token — email + site_id alone
 * cannot unsubscribe a user.  The site is resolved from the request hostname
 * via the middleware-injected x-site-id header — NEVER trusted from the
 * client body.
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

    // Validate the token actually matches a row before reporting success.
    // Previously the UPDATE was fire-and-forget on eq("unsubscribe_token", token),
    // so a random/stale token would silently redirect to /newsletter/unsubscribed
    // even though nothing was actually unsubscribed.
    const { data, error } = await sb
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed" })
      .eq("unsubscribe_token", token)
      .select("id");

    if (error) {
      captureException(error, { context: "[api/newsletter/unsubscribe] GET failed to update:" });
      return NextResponse.redirect(
        new URL("/newsletter/unsubscribed?error=update_failed", request.url),
      );
    }

    if (!data || data.length === 0) {
      // No row matched — treat as an invalid token rather than silently succeeding.
      return NextResponse.redirect(
        new URL("/newsletter/unsubscribed?error=invalid_token", request.url),
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
    const unsubscribeToken = ((bodyOrError.unsubscribe_token as string) ?? "").trim();

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    if (!unsubscribeToken) {
      return NextResponse.json({ error: "unsubscribe_token is required" }, { status: 400 });
    }

    // Site is derived from the hostname by middleware — never from the client body.
    // Middleware rejects unknown hostnames before they reach this handler.
    const siteSlug = request.headers.get("x-site-id");
    if (!siteSlug) {
      return NextResponse.json({ error: "Site could not be resolved" }, { status: 400 });
    }

    let siteId: string;
    try {
      siteId = await resolveDbSiteId(siteSlug);
    } catch (err) {
      captureException(err, { context: "[api/newsletter/unsubscribe] POST site resolve:" });
      return NextResponse.json({ error: "Site could not be resolved" }, { status: 400 });
    }

    const sb = getServiceClient();

    const { data, error } = await sb
      .from("newsletter_subscribers")
      .update({ status: "unsubscribed" })
      .eq("site_id", siteId)
      .eq("email", email)
      .eq("unsubscribe_token", unsubscribeToken)
      .select("id");

    if (error) {
      captureException(error, { context: "[api/newsletter/unsubscribe] POST failed to update:" });
      return NextResponse.json({ error: "Failed to unsubscribe" }, { status: 500 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: "Invalid unsubscribe token" }, { status: 403 });
    }

    return NextResponse.json({ ok: true, message: "You have been unsubscribed." });
  } catch (err) {
    captureException(err, { context: "[api/newsletter/unsubscribe] POST failed:" });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
