import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { getAdminUserByEmail } from "@/lib/dal/admin-users";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { getCurrentSite } from "@/lib/site-context";
import { isValidEmail } from "@/lib/validators";

/**
 * POST /api/auth/forgot-password
 *
 * Accepts { email } and generates a password reset token.
 * The token is stored in the admin_users table and a reset link is sent
 * via email (Resend). If the email doesn't exist, we still return 200
 * to prevent user enumeration.
 */
export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);

    // Rate limit: 3 requests per IP per 15 minutes
    const rl = await checkRateLimit(`forgot-password:${ip}`, {
      maxRequests: 3,
      windowMs: 15 * 60 * 1000,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const email = (body.email ?? "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Valid email is required" },
        { status: 400 },
      );
    }

    // Always return success to prevent user enumeration
    const successResponse = NextResponse.json({
      ok: true,
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });

    const user = await getAdminUserByEmail(email);
    if (!user) {
      return successResponse;
    }

    // Generate reset token with 1-hour expiry
    const resetToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const sb = getServiceClient();
    const { error: updateError } = await sb
      .from("admin_users")
      .update({
        reset_token: resetToken,
        reset_token_expires_at: expiresAt,
      })
      .eq("id", user.id);

    if (updateError) {
      console.error(
        "[api/auth/forgot-password] Failed to store reset token:",
        updateError,
      );
      // Don't expose internal errors — still return success
      return successResponse;
    }

    // Send reset email via Resend
    const origin = request.headers.get("origin") ?? "";
    const resetUrl = `${origin}/admin/reset-password?token=${resetToken}`;
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      const site = await getCurrentSite();
      const fallbackFromEmail = `noreply@${site.domain}`;
      const fromEmail =
        process.env.NEWSLETTER_FROM_EMAIL ?? fallbackFromEmail;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: "Password Reset Request",
          html: buildResetEmail(resetUrl, site.name),
          text: `You requested a password reset.\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error(
          "[api/auth/forgot-password] Failed to send reset email via Resend:",
          errBody,
        );
      }
    } else {
      console.warn(
        "[api/auth/forgot-password] RESEND_API_KEY not set. Reset link:",
        resetUrl,
      );
    }

    return successResponse;
  } catch (err) {
    console.error("[api/auth/forgot-password] POST failed:", err);
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 },
    );
  }
}

function buildResetEmail(resetUrl: string, siteName = "Admin"): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#111827;padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Password Reset</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">Reset your password</h2>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">You requested a password reset. Click the button below to choose a new password. This link expires in 1 hour.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="background-color:#111827;border-radius:8px;">
              <a href="${resetUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">Reset Password</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">Or copy and paste this link:</p>
          <p style="margin:0 0 24px;font-size:13px;color:#6b7280;word-break:break-all;">${resetUrl}</p>
          <p style="margin:0;font-size:13px;color:#9ca3af;">If you did not request this reset, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${year} ${siteName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
