/**
 * R-17: Locale-aware email copy for transactional emails.
 *
 * Provides localised strings for newsletter confirmation and other
 * transactional emails. Supports RTL languages (Arabic) and LTR (English).
 *
 * To add a new locale: add an entry to LOCALE_STRINGS and ensure the
 * HTML templates respect `dir` and plural/date conventions.
 */

export type SupportedLocale = "en" | "ar";

export interface EmailStrings {
  dir: "ltr" | "rtl";
  lang: string;
  confirmSubject: (siteName: string) => string;
  confirmHeading: string;
  confirmBody: (siteName: string) => string;
  confirmButton: string;
  confirmLinkLabel: string;
  confirmIgnore: string;
  confirmPlainText: (siteName: string, url: string, domain: string) => string;
}

const EN_STRINGS: EmailStrings = {
  dir: "ltr",
  lang: "en",
  confirmSubject: (siteName) => `Confirm your subscription to ${siteName}`,
  confirmHeading: "Confirm your subscription",
  confirmBody: (siteName) =>
    `Thanks for subscribing to <strong>${siteName}</strong>! Please confirm your email address by clicking the button below.`,
  confirmButton: "Confirm my subscription",
  confirmLinkLabel: "Or copy and paste this link:",
  confirmIgnore: "If you did not sign up, you can safely ignore this email.",
  confirmPlainText: (siteName, url, domain) =>
    `Thanks for subscribing to ${siteName}!\n\nPlease confirm your email by visiting the link below:\n${url}\n\nIf you did not sign up, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ${siteName} — ${domain}`,
};

const AR_STRINGS: EmailStrings = {
  dir: "rtl",
  lang: "ar",
  confirmSubject: (siteName) => `تأكيد اشتراكك في ${siteName}`,
  confirmHeading: "تأكيد اشتراكك",
  confirmBody: (siteName) =>
    `شكراً لاشتراكك في <strong>${siteName}</strong>! يرجى تأكيد بريدك الإلكتروني بالنقر على الزر أدناه.`,
  confirmButton: "تأكيد اشتراكي",
  confirmLinkLabel: "أو انسخ والصق هذا الرابط:",
  confirmIgnore: "إذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد بأمان.",
  confirmPlainText: (siteName, url, domain) =>
    `شكراً لاشتراكك في ${siteName}!\n\nيرجى تأكيد بريدك الإلكتروني بزيارة الرابط أدناه:\n${url}\n\nإذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد بأمان.\n\n© ${new Date().getFullYear()} ${siteName} — ${domain}`,
};

const LOCALE_MAP: Record<SupportedLocale, EmailStrings> = {
  en: EN_STRINGS,
  ar: AR_STRINGS,
};

/**
 * Resolve email strings for the given locale.
 * Falls back to English for unsupported locales.
 */
export function getEmailStrings(locale?: string): EmailStrings {
  const key = (locale?.toLowerCase().slice(0, 2) ?? "en") as SupportedLocale;
  return LOCALE_MAP[key] ?? EN_STRINGS;
}
