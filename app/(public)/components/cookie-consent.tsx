"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getCookieValue } from "@/lib/cookie-utils";

type ConsentState = "pending" | "accepted" | "rejected";

const CONSENT_COOKIE_NAME = "nichehub-cookie-consent";
const CONSENT_EXPIRY_DAYS = 365;

function readConsentFromCookie(): ConsentState {
  const value = getCookieValue(CONSENT_COOKIE_NAME);
  if (value === "accepted" || value === "rejected") return value;
  return "pending";
}

function setConsentCookie(value: "accepted" | "rejected") {
  const expires = new Date();
  expires.setDate(expires.getDate() + CONSENT_EXPIRY_DAYS);
  document.cookie = `${CONSENT_COOKIE_NAME}=${value}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
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

  if (consent !== "pending" || !visible) return null;

  return (
    <div
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
    window.addEventListener("cookieConsent", handleConsentChange);
    return () => window.removeEventListener("cookieConsent", handleConsentChange);
  }, []);

  return { accepted };
}
