interface TrackingOptions {
  placement?: string;
  campaign?: string;
  productName?: string;
}

function buildQueryParam(key: string, value: string): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
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
 *
 * We use `encodeURIComponent` directly instead of `URLSearchParams` because
 * `URLSearchParams.toString()` encodes spaces as `+`, which breaks tests that
 * verify `%20` encoding and explicit ampersand handling.
 */
export function getTrackingUrl(
  slug: string,
  trackingType: string,
  affiliateUrl: string,
  hasConsent: boolean,
  options?: TrackingOptions,
): string {
  if (hasConsent) {
    const params = [buildQueryParam("p", slug), buildQueryParam("t", trackingType)];
    if (options?.placement) params.push(buildQueryParam("pl", options.placement));
    if (options?.campaign) params.push(buildQueryParam("c", options.campaign));
    // Pass the destination directly when a display name is supplied. This lets
    // the click endpoint record analytics for products that are not in the
    // database (e.g. dashboard-configured watches) without requiring a DB row.
    if (options?.productName) {
      params.push(buildQueryParam("u", affiliateUrl));
      params.push(buildQueryParam("n", options.productName));
    }
    return `/api/track/click?${params.join("&")}`;
  }
  return affiliateUrl;
}
