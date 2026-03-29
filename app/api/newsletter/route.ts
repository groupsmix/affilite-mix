import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { getCurrentSite } from "@/lib/site-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { randomUUID } from "crypto";

/** POST /api/newsletter — Subscribe to the site newsletter (double opt-in) */
export async function POST(request: Request) {
  try {
    // Rate limit: 5 signups per IP per 15 minutes
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("cf-connecting-ip") ??
      "unknown";

    const rl = await checkRateLimit(`newsletter:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();

    // Verify Turnstile token (skipped in dev if not configured)
    const turnstileResult = await verifyTurnstile(body.turnstileToken, ip);
    if (!turnstileResult.success) {
      return NextResponse.json(
        { error: turnstileResult.error ?? "Captcha verification failed" },
        { status: 403 },
      );
    }

    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    const site = await getCurrentSite();
    const sb = getServiceClient();

    // Check if subscriber already exists
    const { data: existing } = await sb
      .from("newsletter_subscribers")
      .select("id, status, confirmed_at")
      .eq("site_id", site.id)
      .eq("email", email)
      .single();

    const confirmationToken = randomUUID();

    if (existing) {
      if (existing.status === "active" && existing.confirmed_at) {
        // Already confirmed — return success silently
        return NextResponse.json({ ok: true, message: "You are already subscribed." });
      }
      // Re-send confirmation: update token and reset status to pending
      const { error: updateError } = await sb
        .from("newsletter_subscribers")
        .update({
          status: "pending",
          confirmation_token: confirmationToken,
          confirmed_at: null,
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error("[api/newsletter] Failed to update subscriber for re-confirmation:", updateError);
        return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
      }
    } else {
      // Insert new subscriber with pending status
      const { error: insertError } = await sb
        .from("newsletter_subscribers")
        .insert({
          site_id: site.id,
          email,
          status: "pending",
          confirmation_token: confirmationToken,
        });

      if (insertError) {
        console.error("[api/newsletter] Failed to insert subscriber:", insertError);
        return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
      }
    }

    // Send confirmation email
    // Uses RESEND_API_KEY if available; otherwise logs the confirmation link
    const confirmUrl = `${request.headers.get("origin") ?? ""}/api/newsletter/confirm?token=${confirmationToken}`;
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? `noreply@${site.domain}`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `Confirm your subscription to ${site.name}`,
          html: `
            <p>Thanks for subscribing to <strong>${site.name}</strong>!</p>
            <p>Please confirm your email by clicking the link below:</p>
            <p><a href="${confirmUrl}">Confirm my subscription</a></p>
            <p>If you did not sign up, you can safely ignore this email.</p>
          `,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error("[api/newsletter] Failed to send confirmation email via Resend:", errBody);
        // Don't fail the request — subscriber is saved, they can retry
      }
    } else {
      console.warn("[api/newsletter] RESEND_API_KEY not set. Confirmation link:", confirmUrl);
    }

    return NextResponse.json({
      ok: true,
      message: "Please check your email to confirm your subscription.",
    });
  } catch (err) {
    console.error("[api/newsletter] POST failed:", err);
    return NextResponse.json({ error: "Failed to subscribe" }, { status: 500 });
  }
}
