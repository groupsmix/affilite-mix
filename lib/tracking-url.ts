/**
 * Shared utility for building consent-aware tracking URLs.
 *
 * When cookie consent has been given, returns the internal tracking redirect
 * (`/api/track/click?p=...&t=...`) so the click is logged.
 *
 * When consent is NOT given (or is still pending), returns the direct
 * affiliate URL so the user is not tracked.
 */
export function getTrackingUrl(
  slug: string,
  trackingType: string,
  affiliateUrl: string,
  hasConsent: boolean,
): string {
  if (hasConsent) {
    return `/api/track/click?p=${encodeURIComponent(slug)}&t=${encodeURIComponent(trackingType)}`;
  }
  return affiliateUrl;
}
