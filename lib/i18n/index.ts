/**
 * F-11/F-12: Internationalization (i18n) locale catalog infrastructure.
 *
 * All user-facing strings (API errors, emails, UI labels) should be sourced
 * from locale catalogs rather than hardcoded inline. This enables:
 * - Multi-language support (EN, AR, etc.)
 * - RTL rendering for Arabic sites
 * - Consistent locale-specific number/date/currency formatting
 * - CLDR-compliant plural rules
 */

export type SupportedLocale = "en" | "ar";

export interface LocaleCatalog {
  locale: SupportedLocale;
  direction: "ltr" | "rtl";
  messages: Record<string, string>;
}

const EN_MESSAGES: Record<string, string> = {
  "error.rate_limited": "Too many requests. Please try again later.",
  "error.unauthorized": "Unauthorized",
  "error.invalid_email": "Please provide a valid email address.",
  "error.already_member": "You are already an active member.",
  "error.payment_not_configured": "Payment system is not configured.",
  "error.checkout_failed": "Checkout failed. Please try again.",
  "newsletter.confirm_subject": "Confirm your subscription",
  "newsletter.confirm_body": "Click the link below to confirm your email subscription.",
  "newsletter.unsubscribe_subject": "You have been unsubscribed",
  "newsletter.unsubscribe_body": "You have been successfully unsubscribed.",
  "membership.welcome_subject": "Welcome to your membership!",
  "membership.welcome_body": "Thank you for becoming a member.",
};

const AR_MESSAGES: Record<string, string> = {
  "error.rate_limited": "طلبات كثيرة جداً. يرجى المحاولة مرة أخرى لاحقاً.",
  "error.unauthorized": "غير مصرح",
  "error.invalid_email": "يرجى تقديم عنوان بريد إلكتروني صالح.",
  "error.already_member": "أنت بالفعل عضو نشط.",
  "error.payment_not_configured": "نظام الدفع غير مكوّن.",
  "error.checkout_failed": "فشلت عملية الدفع. يرجى المحاولة مرة أخرى.",
  "newsletter.confirm_subject": "تأكيد اشتراكك",
  "newsletter.confirm_body": "انقر على الرابط أدناه لتأكيد اشتراك بريدك الإلكتروني.",
  "newsletter.unsubscribe_subject": "تم إلغاء اشتراكك",
  "newsletter.unsubscribe_body": "تم إلغاء اشتراكك بنجاح.",
  "membership.welcome_subject": "مرحباً بك في عضويتك!",
  "membership.welcome_body": "شكراً لك على أن أصبحت عضواً.",
};

const CATALOGS: Record<SupportedLocale, LocaleCatalog> = {
  en: { locale: "en", direction: "ltr", messages: EN_MESSAGES },
  ar: { locale: "ar", direction: "rtl", messages: AR_MESSAGES },
};

/**
 * Get a localized message by key.
 * Falls back to English if the key is not found in the requested locale.
 */
export function t(key: string, locale: SupportedLocale = "en"): string {
  const catalog = CATALOGS[locale] ?? CATALOGS.en;
  return catalog.messages[key] ?? CATALOGS.en.messages[key] ?? key;
}

/**
 * Get the text direction for a locale.
 */
export function getDirection(locale: SupportedLocale): "ltr" | "rtl" {
  return CATALOGS[locale]?.direction ?? "ltr";
}

/**
 * Format a number according to locale conventions.
 */
export function formatNumber(value: number, locale: SupportedLocale = "en"): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * Format a currency value according to locale conventions.
 */
export function formatCurrency(
  value: number,
  currency: string,
  locale: SupportedLocale = "en",
): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value);
}

/**
 * Format a date according to locale conventions.
 */
export function formatDate(date: Date, locale: SupportedLocale = "en"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}
