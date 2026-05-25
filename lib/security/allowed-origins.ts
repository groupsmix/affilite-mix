/**
 * Shared CORS / origin allow-list helper.
 *
 * Centralises the same trust model that middleware.ts uses for CORS preflight
 * and CSRF Origin validation, so individual route handlers (e.g.
 * `/api/vitals` — G-47, exempt from CSRF token validation) can reuse it.
 *
 * Trust model (must stay in sync with middleware.ts):
 *   - Domains and aliases listed in static `allSites` config.
 *   - A `VerifiedSiteRef` passed by the caller — i.e. a site whose slug is
 *     known to come from a verified source (static config match OR a
 *     successful DB row lookup of the request hostname). Raw hostnames are
 *     intentionally NOT accepted: G-33 requires the signature itself to
 *     prevent an unverified `Host` header from extending the allow-list.
 *   - Localhost ports in development.
 */
import { allSites, getSiteById, getSiteByDomain } from "@/config/sites";
import { logger } from "@/lib/logger";

/** Localhost dev origins permitted only when NODE_ENV !== "production". */
const DEV_LOCALHOST_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

/**
 * G-33: an opaque-ish reference to a site that the caller has already
 * verified (either via static `allSites` lookup or a DB site-row lookup).
 *
 * Carrying both the slug AND the domain makes the verification contract
 * explicit at call sites — you cannot construct a `VerifiedSiteRef` from
 * a raw hostname alone, which is the property the audit (G-33) flagged
 * as missing in the previous `verifiedHostname?: string` signature.
 */
export interface VerifiedSiteRef {
  /** Site slug, used as `x-site-id` throughout the app. */
  slug: string;
  /** The verified domain — must come from a trusted source, never from
   * the raw request `Host` header. */
  domain: string;
  /** Optional alias domains from static config. */
  aliases?: string[];
}

/**
 * Build the CORS allow-list for cross-origin API requests.
 *
 * Trust model is documented at the top of this file. The parameter is
 * deliberately a `VerifiedSiteRef` (G-33) rather than a raw hostname so
 * callers cannot accidentally extend the allow-list with an unverified
 * request `Host` header.
 */
export function getAllowedOrigins(verifiedSite?: VerifiedSiteRef | null): string[] {
  const origins: string[] = [];
  for (const site of allSites) {
    origins.push(`https://${site.domain}`);
    if (site.aliases) {
      for (const alias of site.aliases) {
        origins.push(`https://${alias}`);
      }
    }
  }
  if (verifiedSite) {
    origins.push(`https://${verifiedSite.domain}`);
    if (verifiedSite.aliases) {
      for (const alias of verifiedSite.aliases) {
        origins.push(`https://${alias}`);
      }
    }
  }
  if (process.env.NODE_ENV === "development") {
    origins.push(...DEV_LOCALHOST_ORIGINS);
  }
  return origins;
}

/**
 * Build a `VerifiedSiteRef` for a request whose hostname has already been
 * resolved (either via static config OR DB lookup performed by middleware).
 *
 *  - If `hostname` matches a static-config site, we trust it directly and
 *    return that site's slug + domain + aliases.
 *  - Otherwise, if `siteId` is supplied (the `x-site-id` header that
 *    middleware injects only AFTER verifying the hostname against the
 *    `sites` table), the request hostname IS the verified domain — the DB
 *    lookup was `where domain = hostname`, so by induction `hostname` is
 *    a registered domain for that site.
 *  - Otherwise the request is unverified and we return `null`.
 */
export function buildVerifiedSiteRef(
  hostname: string | null | undefined,
  siteId?: string | null,
): VerifiedSiteRef | null {
  const host = (hostname ?? "").split(":")[0];
  if (!host) return null;

  const staticSite = getSiteByDomain(host);
  if (staticSite) {
    return { slug: staticSite.id, domain: staticSite.domain, aliases: staticSite.aliases };
  }

  if (siteId) {
    // Defensive: if siteId happens to match a static-config slug, prefer
    // that record's canonical domain over the request hostname (avoids
    // trusting a stale or proxied `Host` header for static tenants).
    const fromStaticById = getSiteById(siteId);
    if (fromStaticById) {
      return {
        slug: fromStaticById.id,
        domain: fromStaticById.domain,
        aliases: fromStaticById.aliases,
      };
    }
    // DB-managed custom domain — middleware has already DB-verified that
    // `hostname` is registered to `siteId`, so it is safe to add to the
    // allow-list for this request.
    return { slug: siteId, domain: host };
  }

  return null;
}

/**
 * A97: Build the CORS allow-list scoped to a single verified site ONLY.
 * Unlike getAllowedOrigins() which returns all static + verified origins,
 * this returns only origins belonging to the resolved target site.
 * Use this for tenant-scoped telemetry endpoints (click, impression)
 * to prevent cross-tenant origin spoofing.
 */
export function getSiteScopedOrigins(verifiedSite?: VerifiedSiteRef | null): string[] {
  const origins: string[] = [];
  if (verifiedSite) {
    origins.push(`https://${verifiedSite.domain}`);
    if (verifiedSite.aliases) {
      for (const alias of verifiedSite.aliases) {
        origins.push(`https://${alias}`);
      }
    }
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
 *   - If the request carries an `x-site-id` header (middleware has
 *     verified the hostname against the `sites` DB row) → trusted.
 *   - Otherwise the host is NOT added to the allow-list.
 */
export function isOriginAllowed(
  origin: string | null | undefined,
  host: string | null,
  siteId?: string | null,
): boolean {
  if (!origin) return false;
  const canonicalOrigin = origin.toLowerCase().replace(/\/$/, "");
  const verified = buildVerifiedSiteRef(host, siteId);
  return getAllowedOrigins(verified).includes(canonicalOrigin);
}

/**
 * A97: Strict per-site origin validation for telemetry endpoints.
 * Only allows origins that belong to the resolved target site — NOT
 * all sites in the platform. This prevents cross-tenant telemetry spoofing
 * where an attacker on one allowed origin writes to another tenant's
 * click/impression endpoint.
 *
 * @param origin - The Origin header from the request
 * @param siteId - The x-site-id header (middleware-resolved target site)
 * @param host - The request Host header
 * @returns true if origin belongs to the resolved target site
 */
export function isOriginAllowedForSite(
  origin: string | null | undefined,
  siteId: string | null | undefined,
  host: string | null,
): boolean {
  if (!origin || !siteId) return false;
  const canonicalOrigin = origin.toLowerCase().replace(/\/$/, "");
  const verified = buildVerifiedSiteRef(host, siteId);
  // A97: Use site-scoped origins, not the global allow-list
  const siteOrigins = getSiteScopedOrigins(verified);
  const allowed = siteOrigins.includes(canonicalOrigin);
  if (!allowed) {
    logger.warn("[security] Cross-tenant origin rejected for telemetry", {
      origin: canonicalOrigin,
      site_id: siteId,
      host,
      allowed_origins: siteOrigins,
    });
  }
  return allowed;
}
