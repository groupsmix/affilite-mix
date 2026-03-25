import { headers } from "next/headers";
import { getSiteById } from "@/config/sites";
import type { SiteDefinition } from "@/config/site-definition";

const SITE_HEADER = "x-site-id";

/**
 * Read the active site from the request headers (set by middleware).
 * Call this in Server Components and Server Actions.
 */
export async function getCurrentSite(): Promise<SiteDefinition> {
  const headerList = await headers();
  const siteId = headerList.get(SITE_HEADER);

  if (!siteId) {
    throw new Error("x-site-id header missing — is middleware running?");
  }

  const site = getSiteById(siteId);
  if (!site) {
    throw new Error(`Unknown site_id: ${siteId}`);
  }

  return site;
}

/**
 * Extract site_id from a raw header value (for use in API route handlers).
 */
export function getSiteIdFromHeader(headerValue: string | null): string {
  if (!headerValue) {
    throw new Error("x-site-id header missing");
  }
  return headerValue;
}
