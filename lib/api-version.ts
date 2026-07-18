/**
 * API versioning strategy (R-005 / E3#13 / ADR-0008).
 *
 * All current `/api/*` endpoints are the implicit v1 contract. New endpoint
 * families that introduce breaking changes will use an `/api/vN/` URL prefix.
 *
 * We communicate the served numeric major version in the `API-Version`
 * response header. Version selection is URL-based; request headers do not
 * select a different contract.
 */

export const CURRENT_API_VERSION = "1";
export const API_VERSION_HEADER = "API-Version";

/**
 * Set API version headers on a response.
 * Called by the middleware finalizer for matched API routes. Routes excluded
 * from middleware receive the same header from next.config.ts.
 */
export function setApiVersionHeaders(responseHeaders: Headers): void {
  responseHeaders.set(API_VERSION_HEADER, CURRENT_API_VERSION);
}
