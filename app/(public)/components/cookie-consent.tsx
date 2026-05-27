"use client";

import { useState, useEffect } from "react";
import { getCookieValue } from "@/lib/cookie-utils";

type ConsentState = "pending" | "accepted" | "rejected";

function getConsentCookieName(domain: string): string {
  return `nh-cookie-consent-${domain.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function getConsentStorageKey(domain: string): string {
  return `nh-cookie-consent-${domain.replace(/[^a-zA-Z0-9]/g, "_")}`;
}

function readConsentFromCookie(domain: string): ConsentState {
  const value = getCookieValue(getConsentCookieName(domain));
  if (value === "accepted" || value === "rejected") return value;
  return "pending";
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
