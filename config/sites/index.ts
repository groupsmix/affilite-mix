import type { SiteDefinition } from "../site-definition";
import { arabicToolsSite } from "./arabic-tools";
import { cryptoToolsSite } from "./crypto-tools";
import { watchToolsSite } from "./watch-tools";

export { arabicToolsSite, cryptoToolsSite, watchToolsSite };

/** All registered sites. Add new sites here. */
export const allSites: SiteDefinition[] = [arabicToolsSite, cryptoToolsSite, watchToolsSite];

/**
 * Known wildcard parent domains.
 * Any subdomain of these is eligible for automatic DB-based resolution.
 */
export const WILDCARD_PARENT_DOMAINS = ["writnerd.site"];

/** Lookup site by id */
export function getSiteById(id: string): SiteDefinition | undefined {
  return allSites.find((s) => s.id === id);
}

/**
 * Extract subdomain from a hostname given a parent domain.
 * e.g. extractSubdomain("coffee.writnerd.site", "writnerd.site") → "coffee"
 * Returns null if hostname doesn't match the parent or is the bare parent.
 */
export function extractSubdomain(hostname: string, parentDomain: string): string | null {
  const suffix = `.${parentDomain}`;
  if (!hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  // Ignore empty or nested subdomains (only single-level wildcards)
  if (!sub || sub.includes(".")) return null;
  return sub;
}

/**
 * Check if a hostname is a wildcard subdomain of any known parent domain.
 * Returns the full hostname if it is (for DB lookup), or null.
 */
export function isWildcardSubdomain(hostname: string): boolean {
  return WILDCARD_PARENT_DOMAINS.some(
    (parent) => extractSubdomain(hostname, parent) !== null,
  );
}

/** Lookup site by domain or alias (config-only, synchronous) */
export function getSiteByDomain(hostname: string): SiteDefinition | undefined {
  // Direct match on domain or alias
  const direct = allSites.find(
    (s) =>
      s.domain === hostname ||
      s.aliases?.includes(hostname),
  );
  if (direct) return direct;

  // Development fallback: resolve localhost / *.localhost to a site
  if (process.env.NODE_ENV === "development") {
    // Check for <site>.localhost subdomains (e.g. watch.localhost)
    if (hostname.endsWith(".localhost")) {
      const prefix = hostname.replace(/\.localhost$/, "");
      const byAlias = allSites.find((s) =>
        s.aliases?.some((a) => a.startsWith(prefix + ".")),
      );
      if (byAlias) return byAlias;
    }

    // Fallback: use NEXT_PUBLIC_DEFAULT_SITE env var or the first registered site
    if (hostname === "localhost" || hostname.endsWith(".localhost")) {
      const defaultSiteId = process.env.NEXT_PUBLIC_DEFAULT_SITE;
      if (defaultSiteId) {
        const byId = allSites.find((s) => s.id === defaultSiteId);
        if (byId) return byId;
      }
      return allSites[0];
    }
  }

  // For wildcard subdomains, return undefined so middleware can do an async DB lookup
  return undefined;
}
