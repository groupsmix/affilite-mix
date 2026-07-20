interface TrackingOptions {
  placement?: string;
  campaign?: string;
}

/**
 * Shared utility for building consent-aware tracking URLs.
 *
 * When cookie consent has been given, returns the internal tracking redirect
 * (`/api/track/click?p=...&t=...`) so the click is logged.
 *
 * When consent is NOT given (or is still pending), returns the direct
 * affiliate URL so the user is not tracked.
 *
 * Optional `placement` and `campaign` are forwarded to the tracking endpoint
 * as `pl` and `c` query parameters for per-placement and per-campaign reporting.
 */
export function getTrackingUrl(
  slug: string,
  trackingType: string,
  affiliateUrl: string,
  hasConsent: boolean,
  options?: TrackingOptions,
): string {
  if (hasConsent) {
    const params = new URLSearchParams();
    params.set("p", slug);
    params.set("t", trackingType);
    if (options?.placement) params.set("pl", options.placement);
    if (options?.campaign) params.set("c", options.campaign);
    return `/api/track/click?${params.toString()}`;
  }
  return affiliateUrl;
}
