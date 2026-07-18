import { NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
import { getAdminUserByEmail } from "@/lib/dal/admin-users";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";
import { getCurrentSite } from "@/lib/site-context";
import { isValidEmail } from "@/lib/validate-email";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { hashResetToken } from "@/lib/reset-token";
import { buildPasswordResetEmail } from "@/lib/email-templates/password-reset";
import { resolveSendingEmail } from "@/lib/sending-email";

async function randomTimingDelay(): Promise<void> {
  const delayMs = 200 + Math.floor(Math.random() * 400);
  await new Promise((r) => setTimeout(r, delayMs));
}

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
    // P0-5: failPolicy: "closed" — never skip rate limiting on auth routes.
    const rl = await checkRateLimit(`forgot-password:${ip}`, {
      maxRequests: 3,
      windowMs: 15 * 60 * 1000,
      failPolicy: "closed" as const,
      graceMs: 0,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 },
      );
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const email = ((bodyOrError.email as string) ?? "").trim().toLowerCase();

    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
    }

    // Always return success to prevent user enumeration
    const successResponse = NextResponse.json({
      ok: true,
      message: "If an account with that email exists, a password reset link has been sent.",
    });

    const user = await getAdminUserByEmail(email);
    if (!user) {
      // S0-A3-007: add a random delay (200-600ms) to match the response
      // time of the existing-user path (which performs DB writes + email
      // send). Without this, an attacker can distinguish "user exists"
      // from "user doesn't exist" by measuring response latency. CWE-203.
      await randomTimingDelay();
      return successResponse;
    }

    // Issue 13: If a still-valid (unexpired) reset token already exists for
    // this account, return the success response without overwriting the token
    // or re-sending the email. Apply the same random delay as the unknown-user
    // path so an attacker cannot time-discover whether an existing token is
    // present. CWE-203.
    if (user.reset_token && user.reset_token_expires_at) {
      const expiresAtMs = new Date(user.reset_token_expires_at).getTime();
      if (expiresAtMs > Date.now()) {
        // A valid unexpired token exists — silently succeed without overwriting.
        await randomTimingDelay();
        return successResponse;
      }
    }

    // Resolve the active tenant up front: the reset link must point at the
    // tenant the user belongs to, otherwise a user on tenant A could be sent
    // a reset link on tenant B's host (G-22).
    const site = await getCurrentSite();
    if (!site.domain) {
      captureException(new Error("Active site is missing a domain"), {
        context: "[api/auth/forgot-password] Cannot build tenant-aware reset URL",
      });
      return successResponse;
    }

    // Build a tenant-aware base URL for the reset link. In production we
    // always use the active site's own domain so each tenant gets reset
    // links on its own host. APP_URL is only honoured as a local-dev
    // override since dev typically serves all tenants behind a single
    // localhost host.
    // Use `||` (not `??`) so an empty-string APP_URL in a developer's
    // .env also falls through to the site-domain fallback — otherwise we
    // would emit a relative `/q7m-k4j9/reset-password?...` URL in email.
    const baseUrl =
      process.env.NODE_ENV === "production"
        ? `https://${site.domain}`
        : process.env.APP_URL || `https://${site.domain}`;

    // Generate reset token with 1-hour expiry.
    // The raw token is sent to the user via email; only its SHA-256 hash is
    // persisted to the database so a DB leak cannot be replayed to hijack
    // the reset flow.
    const resetToken = crypto.randomUUID();
    const resetTokenHash = await hashResetToken(resetToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const sb = await getTenantClient();
    const { error: updateError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: auth route requires cross-site lookup by email; rate-limited
      .from("admin_users")
      .update({
        reset_token: resetTokenHash,
        reset_token_expires_at: expiresAt,
      })
      .eq("id", user.id);

    if (updateError) {
      captureException(updateError, {
        context: "[api/auth/forgot-password] Failed to store reset token",
      });
      // Don't expose internal errors — still return success
      return successResponse;
    }
    const resetUrl = `${baseUrl}/q7m-k4j9/reset-password?token=${resetToken}`;
    const resendKey = process.env.RESEND_API_KEY;

    if (resendKey) {
      // A144-01: per-tenant sending email for SPF/DKIM alignment
      const safeFpDomain = site.domain
        .normalize("NFC")
        .replace(/[\r\n\0]/g, "")
        .toLowerCase();
      const fromEmail = resolveSendingEmail(site, safeFpDomain);
      // Locale-aware email body so Arabic-language tenants receive
      // translated, RTL-marked content (G-24).
      // A5-002: safeHref validation happens inside buildPasswordResetEmail.
      // It throws if the URL is malformed — this should never happen for a
      // domain-built URL, but we catch defensively.
      let emailPayload: ReturnType<typeof buildPasswordResetEmail>;
      try {
        emailPayload = buildPasswordResetEmail({
          resetUrl,
          siteName: site.name,
          language: site.language,
          direction: site.direction,
        });
      } catch {
        // fail-open: best-effort [criticality:non-critical]
        // A8-001: Never log URLs that contain tokens — capture a sanitized
        // error with only safe metadata (tenant domain, no URL/token).
        captureException(
          new Error("[api/auth/forgot-password] reset URL failed safeHref validation"),
          {
            context: "[api/auth/forgot-password] reset URL failed safeHref validation",
            extra: { domain: site.domain },
          },
        );
        return successResponse;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: emailPayload.subject,
          html: emailPayload.html,
          text: emailPayload.text,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        captureException(new Error(errBody), {
          context: "[api/auth/forgot-password] Failed to send reset email via Resend",
        });
      }
    } else {
      if (process.env.NODE_ENV === "production") {
        captureException(new Error("RESEND_API_KEY missing"), {
          context: "[api/auth/forgot-password] Cannot send reset email",
        });
        return NextResponse.json({ ok: true });
      }
      logger.warn("[dev] Password reset email provider missing");
    }

    return successResponse;
  } catch (err) {
    captureException(err, { context: "[api/auth/forgot-password] POST failed:" });
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 });
  }
}
