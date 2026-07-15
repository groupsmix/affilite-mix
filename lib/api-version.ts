/**
 * API versioning strategy (R-005 / E3#13 / ADR-0008).
 *
 * All current `/api/*` endpoints are the implicit v1 contract. New endpoint
 * families that introduce breaking changes will use an `/api/vN/` URL prefix.
 *
 * We communicate the served version in the `API-Version` response header.
 * Clients may request a specific version with the `Accept-Version` request
 * header. If the requested version is unsupported we fall back to the current
 * stable version rather than echoing an arbitrary client value.
 */

const CURRENT_API_VERSION = "1";
const SUPPORTED_API_VERSIONS = new Set([CURRENT_API_VERSION]);

/** Header names for API versioning. */
const API_VERSION_HEADER = "API-Version";
const SUNSET_HEADER = "Sunset";

function isSupportedVersion(version: string | null | undefined): version is string {
  return typeof version === "string" && SUPPORTED_API_VERSIONS.has(version);
}

function getSunsetDate(version: string): string {
  try {
    const date = new Date(version);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid date");
    }
    date.setMonth(date.getMonth() + 3);
    return date.toUTCString();
  } catch {
    // fail-open: version is not date-based; use a generic 90-day sunset window
    return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();
  }
}

/**
 * Set API version headers on a response.
 * Called by middleware for all /api/* responses.
 */
export function setApiVersionHeaders(
  responseHeaders: Headers,
  requestedVersion?: string | null,
): void {
  const version = isSupportedVersion(requestedVersion) ? requestedVersion : CURRENT_API_VERSION;
  responseHeaders.set(API_VERSION_HEADER, version);

  if (
    requestedVersion &&
    requestedVersion !== CURRENT_API_VERSION &&
    isSupportedVersion(requestedVersion)
  ) {
    responseHeaders.set(SUNSET_HEADER, getSunsetDate(requestedVersion));
    responseHeaders.set("Deprecation", `version="${requestedVersion}"`);
  }
}
