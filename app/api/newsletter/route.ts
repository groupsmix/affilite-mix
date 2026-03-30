import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { getCurrentSite } from "@/lib/site-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/get-client-ip";
import { isValidEmail } from "@/lib/validators";

/** Build a branded HTML email for newsletter confirmation */
function buildConfirmationEmail(siteName: string, confirmUrl: string, domain: string, accentColor: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:${accentColor};padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${siteName}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">Confirm your subscription</h2>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">Thanks for subscribing to <strong>${siteName}</strong>! Please confirm your email address by clicking the button below.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="background-color:${accentColor};border-radius:8px;">
              <a href="${confirmUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Confirm my subscription</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">Or copy and paste this link:</p>
          <p style="margin:0 0 24px;font-size:13px;color:#6b7280;word-break:break-all;">${confirmUrl}</p>
          <p style="margin:0;font-size:13px;color:#9ca3af;">If you did not sign up, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${year} ${siteName} &mdash; ${domain}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** POST /api/newsletter — Subscribe to the site newsletter (double opt-in) */
export async function POST(request: Request) {
  try {
    // Rate limit: 5 signups per IP per 15 minutes
    const ip = getClientIp(request);

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

    if (!email || !isValidEmail(email)) {
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

    const confirmationToken = crypto.randomUUID();

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
          html: buildConfirmationEmail(site.name, confirmUrl, site.domain, site.theme?.accentColor ?? "#10B981"),
          text: `Thanks for subscribing to ${site.name}!\n\nPlease confirm your email by visiting the link below:\n${confirmUrl}\n\nIf you did not sign up, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ${site.name} — ${site.domain}`,
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
