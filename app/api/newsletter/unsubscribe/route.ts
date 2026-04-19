import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { getClientIp } from "@/lib/get-client-ip";
import { parseJsonBody } from "@/lib/api-error";

/** 10 unsubscribe requests per 15 minutes per IP */
const UNSUBSCRIBE_RATE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

/**
 * Shared helper: unsubscribe by opaque token.
 * Returns the Supabase error (if any) or null on success.
 */
async function unsubscribeByToken(token: string) {
  const sb = getServiceClient();
  const { error } = await sb
    .from("newsletter_subscribers")
    .update({ status: "unsubscribed" })
    .eq("unsubscribe_token", token);
  return error;
}

/**
 * GET /api/newsletter/unsubscribe?token=<uuid>
 * Unsubscribes a user using their dedicated unsubscribe_token (not the row id).
 */
export async function GET(request: NextRequest) {
  try {
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

    const error = await unsubscribeByToken(token);
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

/**
 * POST /api/newsletter/unsubscribe
 * Body: { token }
 *
 * Requires the per-subscriber opaque unsubscribe_token.  The previous
 * email+site_id interface was removed because it allowed nuisance
 * unsubscribe abuse — any attacker who knew a victim's email could
 * unsubscribe them without authentication.
 */
export async function POST(request: NextRequest) {
  try {
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
    const token = (bodyOrError.token as string | undefined)?.trim();

    if (!token) {
      return NextResponse.json(
        { error: "token is required (use the unsubscribe link from your email)" },
        { status: 400 },
      );
    }

    const error = await unsubscribeByToken(token);
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
