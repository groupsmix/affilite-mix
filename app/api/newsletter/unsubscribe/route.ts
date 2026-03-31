import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { captureException } from "@/lib/sentry";

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
    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();
    const siteId = body.site_id;

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
