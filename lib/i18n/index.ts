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

interface LocaleCatalog {
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
  "newsletter.confirm_subject": "Confirm your subscription to {siteName}",
  "newsletter.confirm_body": "Click the link below to confirm your email subscription.",
  "newsletter.already_subscribed": "You are already subscribed.",
  "newsletter.check_email": "Please check your email to confirm your subscription.",
  "newsletter.confirm_heading": "Confirm your subscription",
  "newsletter.confirm_thanks":
    "Thanks for subscribing to {siteName}! Please confirm your email address by clicking the button below.",
  "newsletter.confirm_button": "Confirm my subscription",
  "newsletter.confirm_link_hint": "Or copy and paste this link:",
  "newsletter.confirm_ignore": "If you did not sign up, you can safely ignore this email.",
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
  "newsletter.confirm_subject": "تأكيد اشتراكك في {siteName}",
  "newsletter.confirm_body": "انقر على الرابط أدناه لتأكيد اشتراك بريدك الإلكتروني.",
  "newsletter.already_subscribed": "أنت مشترك بالفعل.",
  "newsletter.check_email": "يرجى التحقق من بريدك الإلكتروني لتأكيد اشتراكك.",
  "newsletter.confirm_heading": "تأكيد اشتراكك",
  "newsletter.confirm_thanks":
    "شكراً لاشتراكك في {siteName}! يرجى تأكيد عنوان بريدك الإلكتروني بالنقر على الزر أدناه.",
  "newsletter.confirm_button": "تأكيد اشتراكي",
  "newsletter.confirm_link_hint": "أو انسخ والصق هذا الرابط:",
  "newsletter.confirm_ignore": "إذا لم تسجل، يمكنك تجاهل هذا البريد بأمان.",
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
