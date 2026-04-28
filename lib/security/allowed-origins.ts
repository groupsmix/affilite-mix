/**
 * Shared CORS / origin allow-list helper.
 *
 * Centralises the same trust model that middleware.ts uses for CORS preflight
 * and CSRF Origin validation, so individual route handlers (e.g.
 * `/api/vitals` — G-47, exempt from CSRF token validation) can reuse it.
 *
 * Trust model (must stay in sync with middleware.ts:getAllowedOrigins):
 *   - Domains and aliases listed in static `allSites` config.
 *   - `verifiedHostname` — passed by the caller ONLY after the static config
 *     lookup or DB site-row lookup confirmed the hostname is registered on
 *     an active row in `sites`.
 *   - Localhost ports in development.
 */
import { allSites, getSiteByDomain } from "@/config/sites";

/** Localhost dev origins permitted only when NODE_ENV !== "production". */
const DEV_LOCALHOST_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

/**
 * Build the CORS allow-list for cross-origin API requests.
 * Trust model is documented at the top of this file.
 */
export function getAllowedOrigins(verifiedHostname?: string): string[] {
  const origins: string[] = [];
  for (const site of allSites) {
    origins.push(`https://${site.domain}`);
    if (site.aliases) {
      for (const alias of site.aliases) {
        origins.push(`https://${alias}`);
      }
    }
  }
  if (verifiedHostname) {
    origins.push(`https://${verifiedHostname}`);
  }
  if (process.env.NODE_ENV === "development") {
    origins.push(...DEV_LOCALHOST_ORIGINS);
  }
  return origins;
}

/**
 * Validate the `Origin` header against the allow-list.
 *
 * Used by CSRF-exempt public POST endpoints (e.g. `/api/vitals`) to make
 * sure beacons cannot be cross-fired from arbitrary origins.
 *
 * Trust model for the request hostname:
 *   - If the hostname is registered in static `allSites` config → trusted.
 *   - If the request carries an `x-site-id` header (or equivalent siteId
 *     argument) → the middleware has already resolved the hostname via the
 *     `sites` DB row (see `middleware.ts`), so we can trust the host too.
 *     Without this, DB-registered custom domains (wildcard subdomains,
 *     dashboard-managed custom domains) would falsely 403.
 *   - Otherwise the host is NOT added to the allow-list. An arbitrary
 *     `Host` header cannot upgrade an unknown origin to trusted.
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  host: string | null,
  siteId?: string | null,
): boolean {
  if (!origin) return false;
  const hostname = (host ?? "").split(":")[0];
  const isStaticallyConfigured = Boolean(hostname && getSiteByDomain(hostname));
  const isMiddlewareVerified = Boolean(hostname && siteId);
  const verifiedHostname = isStaticallyConfigured || isMiddlewareVerified ? hostname : undefined;
  return getAllowedOrigins(verifiedHostname).includes(origin);
}
