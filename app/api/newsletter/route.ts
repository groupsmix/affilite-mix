import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { getCurrentSite } from "@/lib/site-context";
import { checkRateLimit } from "@/lib/rate-limit";

/** POST /api/newsletter — Subscribe to the site newsletter */
export async function POST(request: Request) {
  // Rate limit: 5 signups per IP per 15 minutes
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("cf-connecting-ip") ??
    "unknown";

  const rl = checkRateLimit(`newsletter:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }

  const body = await request.json();
  const email = (body.email ?? "").trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const site = await getCurrentSite();
  const sb = getServiceClient();

  // Upsert: if already exists, just return success
  const { error } = await sb
    .from("newsletter_subscribers")
    .upsert(
      { site_id: site.id, email, status: "active" } as never,
      { onConflict: "site_id,email" },
    );

  if (error) {
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
