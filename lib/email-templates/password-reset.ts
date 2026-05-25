/**
 * Locale-aware transactional email template for the password-reset flow
 * (G-24). Routes the email through a per-locale fan-out so Arabic-language
 * tenants receive translated copy with `dir="rtl"` markup, while
 * English-language tenants continue to receive the existing English copy.
 *
 * Adding a new locale: extend `EmailLocale`, add an entry to
 * `PASSWORD_RESET_COPY`, and update `pickEmailLocale()` to map the
 * `SiteDefinition.language` value to it.
 */

import { safeHref } from "./escape";

export type EmailLocale = "en" | "ar";

interface PasswordResetCopy {
  /** Email subject line. */
  readonly subject: string;
  /** Visually-hidden preheader shown by mail clients in the inbox preview. */
  readonly preheader: string;
  /** Header banner heading. */
  readonly bannerHeading: string;
  /** In-body heading above the explanatory paragraph. */
  readonly bodyHeading: string;
  /** Explanatory paragraph above the CTA button. */
  readonly intro: string;
  /** Label rendered inside the CTA button. */
  readonly buttonLabel: string;
  /** Hint shown above the raw link fallback. */
  readonly copyHint: string;
  /** Footer paragraph reassuring uninvolved recipients. */
  readonly disclaimer: string;
  /** Plain-text body builder for clients that strip HTML. */
  readonly plainText: (resetUrl: string, siteName: string) => string;
}

const PASSWORD_RESET_COPY: Record<EmailLocale, PasswordResetCopy> = {
  en: {
    subject: "Password Reset Request",
    preheader: "Reset your password. This link expires in 1 hour.",
    bannerHeading: "Password Reset",
    bodyHeading: "Reset your password",
    intro:
      "You requested a password reset. Click the button below to choose a new password. This link expires in 1 hour.",
    buttonLabel: "Reset Password",
    copyHint: "Or copy and paste this link:",
    disclaimer: "If you did not request this reset, you can safely ignore this email.",
    plainText: (resetUrl, _siteName) => {
      return `You requested a password reset.\n\nClick the link below to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, you can safely ignore this email.`;
    },
  },
  ar: {
    subject: "طلب إعادة تعيين كلمة المرور",
    preheader: "أعد تعيين كلمة المرور الخاصة بك. هذا الرابط صالح لمدة ساعة واحدة.",
    bannerHeading: "إعادة تعيين كلمة المرور",
    bodyHeading: "إعادة تعيين كلمة المرور الخاصة بك",
    intro:
      "لقد طلبتَ إعادة تعيين كلمة المرور. اضغط على الزر أدناه لاختيار كلمة مرور جديدة. هذا الرابط صالح لمدة ساعة واحدة.",
    buttonLabel: "إعادة تعيين كلمة المرور",
    copyHint: "أو انسخ هذا الرابط والصقه:",
    disclaimer: "إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذه الرسالة بأمان.",
    plainText: (resetUrl, siteName) => {
      const safeName = siteName.replace(/[<&>"']/g, " ");
      return `لقد طلبتَ إعادة تعيين كلمة المرور لـ ${safeName}.\n\nاضغط على الرابط أدناه لإعادة تعيين كلمة المرور الخاصة بك:\n${resetUrl}\n\nهذا الرابط صالح لمدة ساعة واحدة.\n\nإذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.`;
    },
  },
};

/**
 * Map a `SiteDefinition.language` value to a supported email locale.
 * Falls back to English when the language is unknown or unset.
 */
export function pickEmailLocale(language: string | null | undefined): EmailLocale {
  if (!language) return "en";
  // Match any Arabic variant (`ar`, `ar-SA`, `ar-EG`, ...).
  if (language.toLowerCase().startsWith("ar")) return "ar";
  return "en";
}

export interface PasswordResetEmailInput {
  readonly resetUrl: string;
  readonly siteName: string;
  /** ISO language code from `SiteDefinition.language` (e.g. `"en"`, `"ar"`). */
  readonly language: string;
  /** Text direction from `SiteDefinition.direction`. */
  readonly direction: "ltr" | "rtl";
}

export interface PasswordResetEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
  readonly locale: EmailLocale;
}

/**
 * Build a locale-aware password-reset email payload (subject, html, text).
 * The HTML output sets `lang` and `dir` on the root `<html>` element so
 * mail clients render Arabic right-to-left correctly.
 */
export function buildPasswordResetEmail(input: PasswordResetEmailInput): PasswordResetEmail {
  const locale = pickEmailLocale(input.language);
  const copy = PASSWORD_RESET_COPY[locale];
  const dir: "ltr" | "rtl" = input.direction === "rtl" ? "rtl" : "ltr";
  const lang = locale === "ar" ? "ar" : "en";
  const year = new Date().getFullYear();

  // A5-002: Validate the reset URL before building the email.
  // safeHref normalises the URL (percent-encoding special chars) for use in
  // href attributes. We keep the original URL for plain-text and visible-text
  // rendering so users can copy-paste the exact link from their email client.
  const safeUrl = safeHref(input.resetUrl);
  if (safeUrl === null) {
    throw new Error(`[email-template] Invalid reset URL: ${input.resetUrl}`);
  }

  const html = renderHtml({
    copy,
    resetUrl: safeUrl,
    rawResetUrl: input.resetUrl,
    siteName: input.siteName,
    dir,
    lang,
    year,
  });

  return {
    subject: copy.subject,
    html,
    text: copy.plainText(input.resetUrl, input.siteName),
    locale,
  };
}

interface RenderInput {
  readonly copy: PasswordResetCopy;
  readonly resetUrl: string;
  /** Original (un-normalised) URL for visible text display. */
  readonly rawResetUrl: string;
  readonly siteName: string;
  readonly dir: "ltr" | "rtl";
  readonly lang: string;
  readonly year: number;
}

function renderHtml(input: RenderInput): string {
  const { copy, resetUrl, rawResetUrl, siteName, dir, lang, year } = input;
  const safeSiteName = escapeHtml(siteName);
  const safeResetUrl = escapeAttribute(resetUrl);
  const safeResetUrlText = escapeHtml(rawResetUrl);
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" dir="${dir}">
  <span style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(copy.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background-color:#111827;padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${escapeHtml(copy.bannerHeading)}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 12px;font-size:20px;color:#111827;">${escapeHtml(copy.bodyHeading)}</h2>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4b5563;">${escapeHtml(copy.intro)}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;">
            <tr><td style="background-color:#111827;border-radius:8px;">
              <a href="${safeResetUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(copy.buttonLabel)}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">${escapeHtml(copy.copyHint)}</p>
          <p style="margin:0 0 24px;font-size:13px;color:#6b7280;word-break:break-all;" dir="ltr">${safeResetUrlText}</p>
          <p style="margin:0;font-size:13px;color:#9ca3af;">${escapeHtml(copy.disclaimer)}</p>
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">&copy; ${year} ${safeSiteName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input);
}
