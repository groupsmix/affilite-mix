/**
 * R-17: Locale-aware email copy for transactional emails.
 *
 * Provides localised strings for newsletter confirmation, unsubscribe,
 * and other transactional emails. Supports RTL languages (Arabic) and LTR (English).
 *
 * A92: Includes CLDR-style pluralization and unsubscribe strings that were
 * previously hardcoded in English.
 *
 * To add a new locale: add an entry to LOCALE_STRINGS and ensure the
 * HTML templates respect `dir` and plural/date conventions.
 */

export type SupportedLocale = "en" | "ar";

/** CLDR plural categories for Arabic */
type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** A92: Select the correct plural form for Arabic (CLDR-compliant). */
function arPlural(n: number): PluralCategory {
  if (n === 0) return "zero";
  if (n === 1) return "one";
  if (n === 2) return "two";
  const mod100 = n % 100;
  if (mod100 >= 3 && mod100 <= 10) return "few";
  if (mod100 >= 11 && mod100 <= 99) return "many";
  return "other";
}

/** A92: Select the correct plural form for English. */
function enPlural(_n: number): PluralCategory {
  return _n === 1 ? "one" : "other";
}

/** A92: Format a pluralized string based on count and locale. */
export function pluralize(
  count: number,
  locale: SupportedLocale,
  forms: { one: string; other: string; zero?: string; two?: string; few?: string; many?: string },
): string {
  const category = locale === "ar" ? arPlural(count) : enPlural(count);
  const template =
    forms[category] ?? (category === "zero" ? forms.other : forms[category]) ?? forms.other;
  return template.replace("{count}", String(count));
}

export interface EmailStrings {
  dir: "ltr" | "rtl";
  lang: string;
  // --- Subscription confirmation ---
  confirmSubject: (siteName: string) => string;
  confirmHeading: string;
  confirmBody: (siteName: string) => string;
  confirmButton: string;
  confirmLinkLabel: string;
  confirmIgnore: string;
  confirmPlainText: (siteName: string, url: string, domain: string) => string;
  // --- Unsubscribe ---
  unsubscribeSubject: (siteName: string) => string;
  unsubscribeHeading: string;
  unsubscribeBody: (siteName: string) => string;
  unsubscribeButton: string;
  unsubscribeLinkLabel: string;
  unsubscribeExpiredHeading: string;
  unsubscribeExpiredBody: string;
  unsubscribeExpiredButton: string;
  unsubscribePlainText: (siteName: string, url: string, domain: string) => string;
  // --- Login ---
  loginSubject: string;
  loginHeading: string;
  loginBody: string;
  loginButton: string;
  loginCodeLabel: string;
  loginExpiryNotice: (minutes: number) => string;
}

const EN_STRINGS: EmailStrings = {
  dir: "ltr",
  lang: "en",
  // --- Subscription confirmation ---
  confirmSubject: (siteName) => `Confirm your subscription to ${siteName}`,
  confirmHeading: "Confirm your subscription",
  confirmBody: (siteName) =>
    `Thanks for subscribing to <strong>${siteName}</strong>! Please confirm your email address by clicking the button below.`,
  confirmButton: "Confirm my subscription",
  confirmLinkLabel: "Or copy and paste this link:",
  confirmIgnore: "If you did not sign up, you can safely ignore this email.",
  confirmPlainText: (siteName, url, domain) =>
    `Thanks for subscribing to ${siteName}!\n\nPlease confirm your email by visiting the link below:\n${url}\n\nIf you did not sign up, you can safely ignore this email.\n\n© ${new Date().getFullYear()} ${siteName} — ${domain}`,
  // --- Unsubscribe ---
  unsubscribeSubject: (siteName) => `Unsubscribe from ${siteName}`,
  unsubscribeHeading: "We're sorry to see you go",
  unsubscribeBody: (siteName) =>
    `You have been unsubscribed from <strong>${siteName}</strong>. You will no longer receive our newsletter.`,
  unsubscribeButton: "Unsubscribe",
  unsubscribeLinkLabel: "Or copy and paste this link:",
  unsubscribeExpiredHeading: "This unsubscribe link has expired",
  unsubscribeExpiredBody:
    "For security, unsubscribe links expire after 30 days. Please subscribe again with your email to receive a fresh link.",
  unsubscribeExpiredButton: "Request new unsubscribe link",
  unsubscribePlainText: (siteName, url, domain) =>
    `You have been unsubscribed from ${siteName}.\n\nIf you did not request this, you can contact us at ${domain}.\n\n© ${new Date().getFullYear()} ${siteName} — ${domain}`,
  // --- Login ---
  loginSubject: "Your login verification code",
  loginHeading: "Verify your login",
  loginBody:
    "Use the verification code below to complete your login. This code will expire in 15 minutes.",
  loginButton: "Verify login",
  loginCodeLabel: "Your verification code:",
  loginExpiryNotice: (minutes: number) => `This code expires in ${pluralize(minutes, "en", { one: "{count} minute", other: "{count} minutes" })}.`,
};

const AR_STRINGS: EmailStrings = {
  dir: "rtl",
  lang: "ar",
  // --- Subscription confirmation ---
  confirmSubject: (siteName) => `تأكيد اشتراكك في ${siteName}`,
  confirmHeading: "تأكيد اشتراكك",
  confirmBody: (siteName) =>
    `شكراً لاشتراكك في <strong>${siteName}</strong>! يرجى تأكيد بريدك الإلكتروني بالنقر على الزر أدناه.`,
  confirmButton: "تأكيد اشتراكي",
  confirmLinkLabel: "أو انسخ والصق هذا الرابط:",
  confirmIgnore: "إذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد بأمان.",
  confirmPlainText: (siteName, url, domain) =>
    `شكراً لاشتراكك في ${siteName}!\n\nيرجى تأكيد بريدك الإلكتروني بزيارة الرابط أدناه:\n${url}\n\nإذا لم تقم بالتسجيل، يمكنك تجاهل هذا البريد بأمان.\n\n© ${new Date().getFullYear()} ${siteName} — ${domain}`,
  // --- Unsubscribe ---
  unsubscribeSubject: (siteName) => `إلغاء الاشتراك من ${siteName}`,
  unsubscribeHeading: "نأسف لرحيلك",
  unsubscribeBody: (siteName) =>
    `لقد تم إلغاء اشتراكك من <strong>${siteName}</strong>. لن تتلقى رسائلنا الإخبارية بعد الآن.`,
  unsubscribeButton: "إلغاء الاشتراك",
  unsubscribeLinkLabel: "أو انسخ والصق هذا الرابط:",
  unsubscribeExpiredHeading: "انتهت صلاحية رابط إلغاء الاشتراك",
  unsubscribeExpiredBody:
    "لأسباب أمنية، تنتهي صلاحية روابط إلغاء الاشتراك بعد 30 يومًا. يرجى الاشتراك مرة أخرى باستخدام بريدك الإلكتروني للحصول على رابط جديد.",
  unsubscribeExpiredButton: "طلب رابط إلغاء اشتراك جديد",
  unsubscribePlainText: (siteName, url, domain) =>
    `لقد تم إلغاء اشتراكك من ${siteName}.\n\nإذا لم تطلب هذا، يمكنك الاتصال بنا على ${domain}.\n\n© ${new Date().getFullYear()} ${siteName} — ${domain}`,
  // --- Login ---
  loginSubject: "رمز التحقق من تسجيل الدخول",
  loginHeading: "تحقق من تسجيل الدخول",
  loginBody:
    "استخدم رمز التحقق أدناه لإكمال تسجيل الدخول. ينتهي صلاحية هذا الرمز خلال 15 دقيقة.",
  loginButton: "تأكيد تسجيل الدخول",
  loginCodeLabel: "رمز التحقق الخاص بك:",
  loginExpiryNotice: (minutes: number) =>
    `ينتهي صلاحية هذا الرمز خلال ${pluralize(minutes, "ar", {
      zero: "{count} دقيقة",
      one: "{count} دقيقة",
      two: "دقيقتين",
      few: "{count} دقائق",
      many: "{count} دقيقة",
      other: "{count} دقيقة",
    })}.`,
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
