import { getSiteRowBySlug, getSiteRowByDomain } from "@/lib/dal/sites";
import type { SiteRow } from "@/types/database";

/**
 * Resolves a site slug (e.g. "crypto-tools") to its database UUID.
 * Uses the cached getSiteRowBySlug from the sites DAL.
 */
export async function resolveDbSiteId(slug: string): Promise<string> {
  const row = await getSiteRowBySlug(slug);
  if (!row) {
    throw new Error(`Site not found in database for slug: ${slug}`);
  }
  return row.id;
}

/**
 * Resolves a hostname to a full SiteRow from the database.
 * Returns null if no matching site is found.
 */
export async function resolveDbSiteByDomain(domain: string): Promise<SiteRow | null> {
  return getSiteRowByDomain(domain);
}

/**
 * Resolves a slug to a full SiteRow from the database.
 * Returns null if no matching site is found.
 */
export async function resolveDbSiteBySlug(slug: string): Promise<SiteRow | null> {
  return getSiteRowBySlug(slug);
}
