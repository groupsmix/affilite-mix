interface TrackingOptions {
  placement?: string;
  campaign?: string;
  productName?: string;
}

function buildQueryParam(key: string, value: string): string {
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

/**
 * Shared utility for building affiliate click tracking URLs.
 *
 * Returns the internal tracking redirect (`/api/track/click?p=...&t=...`) so
 * the click is logged and attributed to the correct product, placement, and
 * campaign. The redirect handler forwards the user to the affiliate URL.
 *
 * The `hasConsent` argument is kept for API compatibility but is no longer
 * used; the tracking redirect is a first-party, server-side navigation and is
 * required for accurate affiliate analytics regardless of cookie banner state.
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
  _hasConsent: boolean,
  options?: TrackingOptions,
): string {
  const params = [buildQueryParam("p", slug), buildQueryParam("t", trackingType)];
  if (options?.placement) params.push(buildQueryParam("pl", options.placement));
  if (options?.campaign) params.push(buildQueryParam("c", options.campaign));
  // Pass the destination directly when a display name is supplied. This lets
  // the click endpoint record analytics for products that are not in the
  // database (e.g. dashboard-configured watches) without requiring a DB row.
  // The destination is pre-encoded once so buildQueryParam double-escapes
  // ampersands inside the affiliate URL. That prevents the platform's query
  // parser from splitting the UTM parameters before the click handler decodes
  // the value.
  if (options?.productName) {
    params.push(buildQueryParam("u", encodeURIComponent(affiliateUrl)));
    params.push(buildQueryParam("n", options.productName));
  }
  return `/api/track/click?${params.join("&")}`;
}
