/**
 * API versioning strategy (R-005 / E3#13).
 *
 * We use date-based API versions in the `API-Version` response header.
 * Clients can request a specific version via `Accept-Version` request header.
 * If no version is requested, the current stable version is used.
 *
 * Migration path:
 *   1. Breaking changes get a new dated version (e.g. "2026-06-01")
 *   2. Previous version remains supported for one quarter
 *   3. Sunset header advertises the deprecation date
 */

const CURRENT_API_VERSION = "2026-05-25";

/** Header names for API versioning. */
const API_VERSION_HEADER = "API-Version";
const SUNSET_HEADER = "Sunset";

/**
 * Set API version headers on a response.
 * Called by middleware for all /api/* responses.
 */
export function setApiVersionHeaders(
  responseHeaders: Headers,
  requestedVersion?: string | null,
): void {
  const version = requestedVersion ?? CURRENT_API_VERSION;
  responseHeaders.set(API_VERSION_HEADER, version);

  if (requestedVersion && requestedVersion !== CURRENT_API_VERSION) {
    responseHeaders.set(SUNSET_HEADER, getSunsetDate(requestedVersion));
    responseHeaders.set("Deprecation", `version="${requestedVersion}"`);
  }
}

function getSunsetDate(version: string): string {
  try {
    const date = new Date(version);
    date.setMonth(date.getMonth() + 3);
    return date.toUTCString();
  } catch {
    // fail-open: version header parse failure defaults to current version
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
  }
}
