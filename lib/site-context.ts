import { headers } from "next/headers";
import { getSiteById } from "@/config/sites";
import type { SiteDefinition } from "@/config/site-definition";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

const SITE_HEADER = "x-site-id";

/**
 * Read the active site from the request headers (set by middleware).
 * Resolves the database UUID so that site.id can be used directly in DAL queries.
 */
export async function getCurrentSite(): Promise<SiteDefinition> {
  const headerList = await headers();
  const siteSlug = headerList.get(SITE_HEADER);

  if (!siteSlug) {
    throw new Error("x-site-id header missing — is middleware running?");
  }

  const site = getSiteById(siteSlug);
  if (!site) {
    throw new Error(`Unknown site_id: ${siteSlug}`);
  }

  // Override id with the database UUID so DAL queries use the correct type
  const dbSiteId = await resolveDbSiteId(siteSlug);

  return { ...site, id: dbSiteId };
}

/**
 * Extract site_id from a raw header value (for use in API route handlers).
 * Returns the slug as-is — callers that need the DB UUID should use resolveDbSiteId.
 */
export function getSiteIdFromHeader(headerValue: string | null): string {
  if (!headerValue) {
    throw new Error("x-site-id header missing");
  }
  return headerValue;
}
