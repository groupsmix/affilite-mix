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
 * Validate the `Origin` header against the static-config allow-list.
 *
 * Used by CSRF-exempt public POST endpoints (e.g. `/api/vitals`) to make
 * sure beacons cannot be cross-fired from arbitrary origins. We deliberately
 * do NOT trust the request's `Host` header here unless it matches a
 * statically configured site — DB-resolved custom domains must be verified
 * by the caller (passing `verifiedHostname`) before being added to the
 * allow-list.
 */
export function isOriginAllowed(origin: string | null | undefined, host: string | null): boolean {
  if (!origin) return false;
  const hostname = (host ?? "").split(":")[0];
  const verifiedHostname = hostname && getSiteByDomain(hostname) ? hostname : undefined;
  return getAllowedOrigins(verifiedHostname).includes(origin);
}
