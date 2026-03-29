"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";

type ConsentState = "pending" | "accepted" | "rejected";

const CONSENT_COOKIE_NAME = "nichehub-cookie-consent";
const CONSENT_EXPIRY_DAYS = 365;

function getConsentState(): ConsentState {
  if (typeof document === "undefined") return "pending";
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${CONSENT_COOKIE_NAME}=`));
  if (!match) return "pending";
  const value = match.split("=")[1];
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

let consentListeners: Array<() => void> = [];

function subscribeConsent(listener: () => void) {
  consentListeners.push(listener);
  return () => {
    consentListeners = consentListeners.filter((l) => l !== listener);
  };
}

function notifyConsentListeners() {
  consentListeners.forEach((l) => l());
}

function getConsentSnapshot(): ConsentState {
  return getConsentState();
}

function getConsentServerSnapshot(): ConsentState {
  return "pending";
}

export default function CookieConsent() {
  const consent = useSyncExternalStore(
    subscribeConsent,
    getConsentSnapshot,
    getConsentServerSnapshot,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (consent === "pending") {
      const timer = setTimeout(() => setVisible(true), 500);
      return () => clearTimeout(timer);
    }
  }, [consent]);

  const handleAccept = useCallback(() => {
    setConsentCookie("accepted");
    setVisible(false);
    notifyConsentListeners();
    dispatchConsentEvent(true);
  }, []);

  const handleReject = useCallback(() => {
    setConsentCookie("rejected");
    setVisible(false);
    notifyConsentListeners();
    dispatchConsentEvent(false);
  }, []);

  if (consent !== "pending" || !visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
    >
      <div
        className="mx-auto max-w-4xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl md:p-8"
        style={{ borderColor: "color-mix(in srgb, var(--color-primary, #1E293B) 20%, transparent)" }}
      >
        <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:gap-6">
          <div className="flex-1">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">
              We value your privacy
            </h2>
            <p className="text-sm leading-relaxed text-gray-600">
              We use essential cookies to make this site work. With your consent,
              we also use analytics cookies to understand how you interact with
              our content and affiliate cookies to track conversions. You can
              change your preferences at any time.{" "}
              <Link
                href="/privacy"
                className="underline transition-colors hover:text-gray-900"
                style={{ color: "var(--color-accent, #10B981)" }}
              >
                Privacy Policy
              </Link>
            </p>
          </div>
          <div className="flex w-full shrink-0 flex-col gap-3 sm:flex-row md:w-auto">
            <button
              onClick={handleReject}
              className="min-h-[44px] rounded-xl border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 transition-all duration-300 hover:bg-gray-50"
            >
              Reject Non-Essential
            </button>
            <button
              onClick={handleAccept}
              className="min-h-[44px] rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all duration-300 hover:opacity-90"
              style={{ backgroundColor: "var(--color-accent, #10B981)" }}
            >
              Accept All
            </button>
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
  const consent = useSyncExternalStore(
    (listener) => {
      const handler = () => listener();
      window.addEventListener("cookieConsent", handler);
      return () => window.removeEventListener("cookieConsent", handler);
    },
    () => getConsentState() === "accepted",
    () => false,
  );

  return { accepted: consent };
}
