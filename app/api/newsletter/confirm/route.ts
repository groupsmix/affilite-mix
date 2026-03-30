import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/newsletter/confirm?token=<uuid>
 * Confirms a newsletter subscription via the double opt-in token.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.redirect(
        new URL("/newsletter/confirmed?error=missing_token", request.url),
      );
    }

    const sb = getServiceClient();

    // Find the subscriber by confirmation token
    const { data: subscriber, error: fetchError } = await sb
      .from("newsletter_subscribers")
      .select("id, status, confirmed_at")
      .eq("confirmation_token", token)
      .single();

    if (fetchError || !subscriber) {
      console.error("[api/newsletter/confirm] Token lookup failed:", fetchError);
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
      console.error("[api/newsletter/confirm] Failed to activate subscriber:", updateError);
      return NextResponse.redirect(
        new URL("/newsletter/confirmed?error=update_failed", request.url),
      );
    }

    return NextResponse.redirect(new URL("/newsletter/confirmed", request.url));
  } catch (err) {
    console.error("[api/newsletter/confirm] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
