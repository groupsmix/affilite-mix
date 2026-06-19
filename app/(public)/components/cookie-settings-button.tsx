"use client";

import * as CookieConsent from "vanilla-cookieconsent";

interface CookieSettingsButtonProps {
  label: string;
  /** Optional extra className, e.g. for overriding color in dark footers. */
  className?: string;
}

/**
 * Client-side button that opens the cookie preferences modal.
 * GDPR requires users to be able to withdraw/change consent at any time.
 */
export function CookieSettingsButton({ label, className }: CookieSettingsButtonProps) {
  return (
    <button
      type="button"
      onClick={() => CookieConsent.showPreferences()}
      className={className ?? "text-xs text-gray-500 underline hover:text-gray-600"}
    >
      {label}
    </button>
  );
}
