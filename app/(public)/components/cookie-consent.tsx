"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { getCookieValue } from "@/lib/cookie-utils";

type ConsentState = "pending" | "accepted" | "rejected";

const CONSENT_COOKIE_NAME = "nh-cookie-consent";
const CONSENT_EXPIRY_DAYS = 365;

function readConsentFromCookie(): ConsentState {
  const value = getCookieValue(CONSENT_COOKIE_NAME);
  if (value === "accepted" || value === "rejected") return value;
  return "pending";
}

const CONSENT_STORAGE_KEY = "nh-cookie-consent";

function setConsentCookie(value: "accepted" | "rejected") {
  const expires = new Date();
  expires.setDate(expires.getDate() + CONSENT_EXPIRY_DAYS);
  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  // Also write to localStorage so other tabs can detect the change via the storage event
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // localStorage may be unavailable (e.g. private browsing)
  }
}

function dispatchConsentEvent(accepted: boolean) {
  window.dispatchEvent(
    new CustomEvent("cookieConsent", { detail: { accepted } }),
  );
}

interface CookieConsentProps {
  language?: string;
}

const translations = {
  en: {
    title: "We value your privacy",
    body: "We use essential cookies to make this site work. With your consent, we also use analytics cookies to understand how you interact with our content and affiliate cookies to track conversions. You can change your preferences at any time.",
    reject: "Reject Non-Essential",
    accept: "Accept All",
    privacy: "Privacy Policy",
  },
  ar: {
    title: "نحن نقدر خصوصيتك",
    body: "نستخدم ملفات تعريف الارتباط الأساسية لتشغيل هذا الموقع. بموافقتك، نستخدم أيضًا ملفات تعريف الارتباط التحليلية لفهم كيفية تفاعلك مع المحتوى وملفات تعريف الارتباط التابعة لتتبع التحويلات. يمكنك تغيير تفضيلاتك في أي وقت.",
    reject: "رفض غير الأساسية",
    accept: "قبول الكل",
    privacy: "سياسة الخصوصية",
  },
} as const;

export default function CookieConsent({ language = "en" }: CookieConsentProps) {
  const t = language === "ar" ? translations.ar : translations.en;
  const [consent, setConsent] = useState<ConsentState>("pending");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = readConsentFromCookie();
    setConsent(stored);
    if (stored === "pending") {
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = useCallback(() => {
    setConsentCookie("accepted");
    setConsent("accepted");
    setVisible(false);
    dispatchConsentEvent(true);
  }, []);

  const handleReject = useCallback(() => {
    setConsentCookie("rejected");
    setConsent("rejected");
    setVisible(false);
    dispatchConsentEvent(false);
  }, []);

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
      className="fixed bottom-0 left-0 right-0 z-50 p-2 sm:p-4 md:p-6"
    >
      <div
        className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-3 shadow-2xl sm:rounded-2xl sm:p-6 md:p-8"
        style={{ borderColor: "color-mix(in srgb, var(--color-primary, #1E293B) 20%, transparent)" }}
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
              <h2 className="mb-2 text-lg font-semibold text-gray-900">
                {t.title}
              </h2>
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
 * Hook for other components to check cookie consent status.
 */
export function useCookieConsent(): { accepted: boolean } {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    setAccepted(readConsentFromCookie() === "accepted");

    function handleConsentChange() {
      setAccepted(readConsentFromCookie() === "accepted");
    }

    // Listen for same-tab consent changes
    window.addEventListener("cookieConsent", handleConsentChange);

    // Listen for cross-tab consent changes via localStorage storage event
    function handleStorageChange(e: StorageEvent) {
      if (e.key === CONSENT_STORAGE_KEY) {
        handleConsentChange();
      }
    }
    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("cookieConsent", handleConsentChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  return { accepted };
}
