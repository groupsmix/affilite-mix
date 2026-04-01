"use client";

import { resetCookieConsent } from "./cookie-consent";

interface CookieSettingsButtonProps {
  label: string;
}

/**
 * Client-side button that resets cookie consent and re-shows the banner.
 * GDPR requires users to be able to withdraw/change consent at any time.
 */
export function CookieSettingsButton({ label }: CookieSettingsButtonProps) {
  return (
    <button
      type="button"
      onClick={resetCookieConsent}
      className="text-xs text-gray-500 underline hover:text-gray-600"
    >
      {label}
    </button>
  );
}
