import { NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
import { getCurrentSite } from "@/lib/site-context";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/lib/get-client-ip";
import { isValidEmail, normalizeEmail, hashEmailForRateLimit } from "@/lib/validate-email";
import { apiError, rateLimitHeaders, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { hashNewsletterToken } from "@/lib/newsletter-token";
import { escapeAttribute, escapeHtml, safeHexColor, safeHref } from "@/lib/email-templates/escape";
import { logger } from "@/lib/logger";
import { validateNotDisposable } from "@/lib/security/disposable-email";
import { t, type SupportedLocale } from "@/lib/i18n";

/**
 * Build a branded HTML email for newsletter confirmation.
 *
 * T-08: every interpolated value is either HTML-escaped or, in the case
 * of `confirmUrl`, validated through `safeHref()` so a compromised
 * admin / DB-poisoning vector can't smuggle a `javascript:` link or
 * style-injection into the rendered message. The accent colour is
 * funnelled through `safeHexColor()` for the same reason.
 */
function buildConfirmationEmail(
  siteName: string,
  confirmUrl: string,
  domain: string,
  accentColor: string,
  locale: SupportedLocale = "en",
): string | null {
  const year = new Date().getFullYear();
  const safeName = escapeHtml(siteName);
  const safeDomain = escapeHtml(domain);
  const safeColor = safeHexColor(accentColor, "#10B981");
  const safeUrlValue = safeHref(confirmUrl, [domain]);
  if (safeUrlValue === null) return null;
  const safeUrlAttr = escapeAttribute(safeUrlValue);
  const safeUrlText = escapeHtml(safeUrlValue);
  return `<!DOCTYPE html>
<html lang="${locale}"${locale === "ar" ? ' dir="rtl"' : ""}>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:${safeColor};padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${safeName}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(t("newsletter.confirm_heading", locale))}</h2>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">${escapeHtml(t("newsletter.confirm_thanks", locale).replace("{siteName}", siteName))}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="background-color:${safeColor};border-radius:8px;">
              <a href="${safeUrlAttr}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(t("newsletter.confirm_button", locale))}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">${escapeHtml(t("newsletter.confirm_link_hint", locale))}</p>
          <p style="margin:0 0 24px;font-size:13px;color:#6b7280;word-break:break-all;">${safeUrlText}</p>
          <p style="margin:0;font-size:13px;color:#9ca3af;">${escapeHtml(t("newsletter.confirm_ignore", locale))}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${year} ${safeName} &mdash; ${safeDomain}</p>
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
    const resendKey = process.env.RESEND_API_KEY;
    const isProd = process.env.NODE_ENV === "production";
    if (!resendKey && isProd) {
      logger.error(
        "[api/newsletter] RESEND_API_KEY not configured in production — rejecting signup",
      );
      return apiError(503, "Newsletter email is temporarily unavailable", undefined, {
        "Retry-After": "60",
      });
    }

    const ip = getClientIp(request);
    const nlRateConfig = {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
      failPolicy: "closed" as const,
    };
    const rl = await checkRateLimit(`newsletter:${ip}`, nlRateConfig);
    if (!rl.allowed) {
      return apiError(429, "Too many requests. Please try again later.", undefined, {
        "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        ...rateLimitHeaders(nlRateConfig, rl),
      });
    }

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;

    const { website } = bodyOrError as { website?: string };
    if (website && website.length > 0) {
      logger.info("[api/newsletter] Honeypot triggered");
      return NextResponse.json({
        ok: true,
        message: t("newsletter.check_email"),
      });
    }

    const turnstileResult = await verifyTurnstile(
      bodyOrError.turnstileToken as string | undefined,
      ip,
    );
    if (!turnstileResult.success) {
      return apiError(403, turnstileResult.error ?? "Captcha verification failed");
    }

    const email = normalizeEmail((bodyOrError.email as string) ?? "");
    if (!email || !isValidEmail(email)) {
      return apiError(400, "Valid email is required");
    }

    const disposableError = validateNotDisposable(email);
    if (disposableError) {
      return apiError(400, disposableError);
    }

    const emailHash = await hashEmailForRateLimit(email);
    const emailRateConfig = { maxRequests: 5, windowMs: 60 * 60 * 1000 };
    const emailRl = await checkRateLimit(`newsletter:cooldown:${emailHash}`, emailRateConfig);
    if (!emailRl.allowed) {
      return apiError(429, "Too many signup attempts for this email", undefined, {
        "Retry-After": String(Math.ceil(emailRl.retryAfterMs / 1000)),
        ...rateLimitHeaders(emailRateConfig, emailRl),
      });
    }

    const site = await getCurrentSite();
    const sb = await getTenantClient();
    const { data: existing } = await sb
      // eslint-disable-next-line no-restricted-syntax -- direct newsletter subscriber lookup is query-justified as no DAL wrapper exists
      .from("newsletter_subscribers")
      .select("id, status, confirmed_at")
      .eq("site_id", site.id)
      .eq("email", email)
      .single();

    const confirmationToken = crypto.randomUUID();
    const confirmationTokenHash = await hashNewsletterToken(confirmationToken);
    const unsubscribeToken = crypto.randomUUID();
    const unsubscribeTokenHash = await hashNewsletterToken(unsubscribeToken);

    if (existing) {
      if (existing.status === "active" && existing.confirmed_at) {
        return NextResponse.json({ ok: true, message: t("newsletter.already_subscribed") });
      }
      const { error: updateError } = await sb
        // eslint-disable-next-line no-restricted-syntax -- direct newsletter subscriber update is query-justified as no DAL wrapper exists
        .from("newsletter_subscribers")
        .update({
          status: "pending",
          confirmation_token: confirmationTokenHash,
          unsubscribe_token: unsubscribeTokenHash,
          confirmed_at: null,
        })
        .eq("id", existing.id)
        // AUDIT-FIX A5-002: Defense-in-depth site_id predicate on update
        .eq("site_id", site.id);

      if (updateError) {
        captureException(updateError, {
          context: "[api/newsletter] Failed to update subscriber for re-confirmation:",
        });
        return apiError(500, "Failed to subscribe");
      }
    } else {
      // eslint-disable-next-line no-restricted-syntax -- direct newsletter subscriber insert is query-justified as no DAL wrapper exists
      const { error: insertError } = await sb.from("newsletter_subscribers").insert({
        site_id: site.id,
        email,
        status: "pending",
        confirmation_token: confirmationTokenHash,
        unsubscribe_token: unsubscribeTokenHash,
      });

      if (insertError) {
        captureException(insertError, { context: "[api/newsletter] Failed to insert subscriber:" });
        return apiError(500, "Failed to subscribe");
      }
    }

    const siteLocale = (site.locale === "ar" ? "ar" : "en") as SupportedLocale;
    const baseUrl = `https://${site.domain}`;
    const confirmUrl = `${baseUrl}/newsletter/confirm?token=${confirmationToken}`;
    const emailHtml = buildConfirmationEmail(
      site.name,
      confirmUrl,
      site.domain,
      (site.theme as Record<string, string>)?.accentColor ?? "#10B981",
      siteLocale,
    );

    if (emailHtml === null) {
      // A8-001: Never log URLs that contain tokens
      logger.error("[newsletter] buildConfirmationEmail returned null — safeHref rejected URL", {
        siteId: site.id,
        domain: site.domain,
      });
      captureException(new Error("buildConfirmationEmail: safeHref rejected confirmation URL"), {
        context: "[api/newsletter] confirmation URL failed safeHref validation",
      });
      return apiError(
        503,
        "Newsletter email is temporarily unavailable. Please try again later.",
        undefined,
        {
          "Retry-After": "60",
        },
      );
    }

    // A5-001: Build a plain-text email that also escapes the site name and domain.
    const safeTextSiteName = site.name.replace(/[<&>"']/g, " ");
    const safeTextDomain = site.domain.replace(/[<&>"']/g, " ");
    const emailText = `${t("newsletter.confirm_plain_thanks", siteLocale).replace("{siteName}", safeTextSiteName)}\n\n${t("newsletter.confirm_plain_link_prompt", siteLocale)}\n${confirmUrl}\n\n${t("newsletter.confirm_ignore", siteLocale)}\n\n© ${new Date().getFullYear()} ${safeTextSiteName} — ${safeTextDomain}`;

    if (!resendKey) {
      if (isProd) {
        logger.error("[newsletter] RESEND_API_KEY missing in production", {
          siteId: site.id,
        });
        return apiError(
          503,
          "Newsletter email is temporarily unavailable. Please try again later.",
          undefined,
          { "Retry-After": "60" },
        );
      }
      logger.warn("[newsletter] email provider unavailable (dev)", {
        siteId: site.id,
      });
    } else {
      // AUDIT-FIX A1-007/A2-004: Sanitize site name/domain in email headers
      // to prevent CRLF injection that could spoof sender identity or inject headers.
      const headerSafe = (s: string) =>
        s
          .normalize("NFC")
          .replace(/[\r\n\0]/g, " ")
          .slice(0, 120);
      const safeSiteName = headerSafe(site.name);
      // RC-006: Validate site.domain before using in From header to prevent
      // CRLF injection or malformed email addresses from poisoned DB data.
      const safeDomain = site.domain
        .normalize("NFC")
        .replace(/[\r\n\0]/g, "")
        .toLowerCase();
      if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(safeDomain)) {
        logger.error("[newsletter] site.domain failed hostname validation", {
          siteId: site.id,
          domain: site.domain,
        });
        return apiError(
          503,
          "Newsletter email is temporarily unavailable. Please try again later.",
        );
      }
      const fromEmail = process.env.NEWSLETTER_FROM_EMAIL ?? `noreply@${safeDomain}`;
      // A150-01: RFC 8058 / Gmail-Yahoo 2024 bulk-sender one-click unsubscribe.
      const unsubscribeUrl = `${baseUrl}/api/newsletter/unsubscribe?token=${unsubscribeToken}`;
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: t("newsletter.confirm_subject", siteLocale).replace("{siteName}", safeSiteName),
          html: emailHtml,
          text: emailText,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });
      if (!res.ok) {
        await res.text().catch(() => "");
        captureException(new Error(`Resend returned ${res.status}`), {
          context: "[api/newsletter] Failed to send confirmation email via Resend",
        });
        if (isProd) {
          return apiError(
            503,
            "Newsletter email could not be delivered. Please try again later.",
            undefined,
            {
              "Retry-After": "30",
            },
          );
        }
      }
    }

    return NextResponse.json({
      ok: true,
      message: t("newsletter.check_email"),
    });
  } catch (err) {
    captureException(err, { context: "[api/newsletter] POST failed:" });
    return apiError(500, "Failed to subscribe");
  }
}
