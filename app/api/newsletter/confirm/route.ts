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
      return NextResponse.json({ error: "Missing confirmation token" }, { status: 400 });
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
      return NextResponse.json(
        { error: "Invalid or expired confirmation token" },
        { status: 404 },
      );
    }

    if (subscriber.status === "active" && subscriber.confirmed_at) {
      return NextResponse.json({ ok: true, message: "Already confirmed." });
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
      return NextResponse.json({ error: "Failed to confirm subscription" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, message: "Subscription confirmed!" });
  } catch (err) {
    console.error("[api/newsletter/confirm] GET failed:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
