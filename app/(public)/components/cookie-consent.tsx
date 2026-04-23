"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getCookieValue } from "@/lib/cookie-utils";

type ConsentState = "pending" | "accepted" | "rejected";

// Domain-scoped cookie consent keys to prevent cross-site consent leakage
function getConsentCookieName(domain: string): string {
  return `nh-cookie-consent-${domain.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function getConsentStorageKey(domain: string): string {
  return `nh-cookie-consent-${domain.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

const CONSENT_EXPIRY_DAYS = 365;

function readConsentFromCookie(domain: string): ConsentState {
  const value = getCookieValue(getConsentCookieName(domain));
  if (value === "accepted" || value === "rejected") return value;
  return "pending";
}

interface CookieConsentProps {
  language?: string;
  domain?: string;
}

function setConsentCookie(value: "accepted" | "rejected", domain: string) {
  const expires = new Date();
  expires.setDate(expires.getDate() + CONSENT_EXPIRY_DAYS);
  const cookieName = getConsentCookieName(domain);
  const storageKey = getConsentStorageKey(domain);
  document.cookie = `${cookieName}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  // Also write to localStorage so other tabs can detect the change via the storage event
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // localStorage may be unavailable (e.g. private browsing)
  }
}

function dispatchConsentEvent(accepted: boolean) {
  window.dispatchEvent(new CustomEvent("cookieConsent", { detail: { accepted } }));
}

const translations = {
  en: {
    title: "We value your privacy",
    body: "We use essential cookies to make this site work. With your consent, we also use analytics cookies to understand how you interact with our content and affiliate cookies to track conversions. You can change your preferences at any time.",
    reject: "Reject Non-Essential",
    accept: "Accept All",
    privacy: "Privacy Policy",
    details: "Cookie details",
    cookieList: [
      {
        name: "nh-cookie-consent",
        purpose: "Stores your cookie consent preference",
        type: "Essential",
      },
      {
        name: "nh_active_site",
        purpose: "Remembers your active site selection",
        type: "Essential",
      },
      { name: "nh_admin_token", purpose: "Admin session authentication (JWT)", type: "Essential" },
      { name: "nh_csrf", purpose: "CSRF protection token", type: "Essential" },
      {
        name: "Affiliate tracking",
        purpose: "Tracks affiliate link clicks for conversion attribution",
        type: "Non-essential",
      },
    ],
  },
  ar: {
    title: "نحن نقدر خصوصيتك",
    body: "نستخدم ملفات تعريف الارتباط الأساسية لتشغيل هذا الموقع. بموافقتك، نستخدم أيضًا ملفات تعريف الارتباط التحليلية لفهم كيفية تفاعلك مع المحتوى وملفات تعريف الارتباط التابعة لتتبع التحويلات. يمكنك تغيير تفضيلاتك في أي وقت.",
    reject: "رفض غير الأساسية",
    accept: "قبول الكل",
    privacy: "سياسة الخصوصية",
    details: "تفاصيل ملفات تعريف الارتباط",
    cookieList: [
      {
        name: "nh-cookie-consent",
        purpose: "يخزن تفضيل موافقة ملفات تعريف الارتباط",
        type: "أساسي",
      },
      { name: "nh_active_site", purpose: "يتذكر اختيار الموقع النشط", type: "أساسي" },
      { name: "nh_admin_token", purpose: "مصادقة جلسة المشرف (JWT)", type: "أساسي" },
      { name: "nh_csrf", purpose: "رمز حماية CSRF", type: "أساسي" },
      {
        name: "تتبع الشركات التابعة",
        purpose: "يتتبع نقرات روابط الشركات التابعة لإسناد التحويل",
        type: "غير أساسي",
      },
    ],
  },
} as const;

export default function CookieConsent({ language = "en", domain = "" }: CookieConsentProps) {
  const t = language === "ar" ? translations.ar : translations.en;
  const [consent, setConsent] = useState<ConsentState>("pending");
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [currentDomain, setCurrentDomain] = useState(domain);

  useEffect(() => {
    // Get domain from window if not provided
    const effectiveDomain = domain || window.location.hostname;
    setCurrentDomain(effectiveDomain);
    const stored = readConsentFromCookie(effectiveDomain);
    setConsent(stored);
    if (stored === "pending") {
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [domain]);

  const handleAccept = useCallback(() => {
    setConsentCookie("accepted", currentDomain);
    setConsent("accepted");
    setVisible(false);
    dispatchConsentEvent(true);
  }, [currentDomain]);

  const handleReject = useCallback(() => {
    setConsentCookie("rejected", currentDomain);
    setConsent("rejected");
    setVisible(false);
    dispatchConsentEvent(false);
  }, [currentDomain]);

  const bannerRef = useRef<HTMLDivElement>(null);
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    if (!visible || consent !== "pending") {
      document.documentElement.style.removeProperty("--cookie-banner-height");
      return;
    }
    function measure() {
      if (bannerRef.current) {
        const h = bannerRef.current.offsetHeight;
        setBannerHeight(h);
        document.documentElement.style.setProperty("--cookie-banner-height", `${h}px`);
      }
    }
    measure();
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      document.documentElement.style.removeProperty("--cookie-banner-height");
    };
  }, [visible, consent]);

  if (consent !== "pending" || !visible) return null;

  return (
    <>
      {/* Spacer to prevent banner from covering page content */}
      {bannerHeight > 0 && <div style={{ height: bannerHeight }} />}
      <div
        ref={bannerRef}
        role="dialog"
        aria-label="Cookie consent"
        className="fixed inset-x-0 bottom-0 z-50 p-2 sm:p-4 md:p-6"
      >
        <div
          className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-3 shadow-2xl sm:rounded-2xl sm:p-6 md:p-8"
          style={{
            borderColor: "color-mix(in srgb, var(--color-primary, #1E293B) 20%, transparent)",
          }}
        >
          {/* Mobile: compact single-row layout */}
          <div className="flex items-center gap-3 sm:hidden">
            <p className="flex-1 text-xs leading-snug text-gray-600">
              {t.title}.{" "}
              <Link
                href="/privacy"
                className="underline"
                style={{ color: "var(--color-accent, #10B981)" }}
              >
                {t.privacy}
              </Link>
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={handleReject}
                className="min-h-[36px] rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-all duration-300 hover:bg-gray-50"
              >
                {t.reject}
              </button>
              <button
                onClick={handleAccept}
                className="min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-all duration-300 hover:opacity-90"
                style={{ backgroundColor: "var(--color-accent, #10B981)" }}
              >
                {t.accept}
              </button>
            </div>
          </div>

          {/* Desktop / tablet: full layout */}
          <div className="hidden sm:block">
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-6">
              <div className="flex-1">
                <h2 className="mb-2 text-lg font-semibold text-gray-900">{t.title}</h2>
                <p className="text-sm leading-relaxed text-gray-600">
                  {t.body}{" "}
                  <Link
                    href="/privacy"
                    className="underline transition-colors hover:text-gray-900"
                    style={{ color: "var(--color-accent, #10B981)" }}
                  >
                    {t.privacy}
                  </Link>
                </p>
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="mt-1 text-xs font-medium text-gray-500 underline hover:text-gray-700"
                  type="button"
                >
                  {t.details}
                </button>
                {showDetails && (
                  <table className="mt-2 w-full text-xs text-gray-600">
                    <thead>
                      <tr className="border-b border-gray-200 text-start">
                        <th className="pb-1 pe-3 font-semibold">Cookie</th>
                        <th className="pb-1 pe-3 font-semibold">Purpose</th>
                        <th className="pb-1 font-semibold">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.cookieList.map((c) => (
                        <tr key={c.name} className="border-b border-gray-100">
                          <td className="py-1 pe-3 font-mono">{c.name}</td>
                          <td className="py-1 pe-3">{c.purpose}</td>
                          <td className="py-1">{c.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row md:w-auto">
                <button
                  onClick={handleReject}
                  className="min-h-[44px] rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-all duration-300 hover:bg-gray-50"
                >
                  {t.reject}
                </button>
                <button
                  onClick={handleAccept}
                  className="min-h-[44px] rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:opacity-90"
                  style={{ backgroundColor: "var(--color-accent, #10B981)" }}
                >
                  {t.accept}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Resets cookie consent so the banner re-appears.
 * Call this from a "Cookie Settings" link in the footer.
 */
export function resetCookieConsent(domain?: string) {
  const effectiveDomain = domain || window.location.hostname;
  const cookieName = getConsentCookieName(effectiveDomain);
  const storageKey = getConsentStorageKey(effectiveDomain);
  // Clear the cookie
  document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  // Clear localStorage mirror
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // localStorage may be unavailable
  }
  // Reload the page so the banner re-renders
  window.location.reload();
}

/**
 * Hook for other components to check cookie consent status.
 */
export function useCookieConsent(domain?: string): { accepted: boolean } {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    const effectiveDomain = domain || window.location.hostname;
    setAccepted(readConsentFromCookie(effectiveDomain) === "accepted");

    function handleConsentChange() {
      setAccepted(readConsentFromCookie(effectiveDomain) === "accepted");
    }

    // Listen for same-tab consent changes
    window.addEventListener("cookieConsent", handleConsentChange);

    // Listen for cross-tab consent changes via localStorage storage event
    const storageKey = getConsentStorageKey(effectiveDomain);
    function handleStorageChange(e: StorageEvent) {
      if (e.key === storageKey) {
        handleConsentChange();
      }
    }
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("cookieConsent", handleConsentChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [domain]);

  return { accepted };
}
