/**
 * Unified site resolver — DB-first with TS config fallback.
 *
 * Audit finding 1.2 (MEDIUM): Consolidate site config duplication.
 *
 * Static TS configs (config/sites/*.ts) and the DB `sites` table coexisted
 * with no clear precedence. This module establishes a single resolution
 * strategy:
 *
 *   1. Query the DB `sites` table (cached via DAL).
 *   2. If no DB row exists, fall back to the static TS config.
 *   3. Middleware and public pages always go through this resolver.
 *
 * The TS configs remain as bootstrapping defaults for local dev and as a
 * fallback when the DB is unreachable — they are NOT the source of truth
 * once a site is persisted to the database.
 */

import { getSiteRowBySlug, getSiteRowByDomain } from "@/lib/dal/sites";
import {
  getSiteByDomain as getStaticSiteByDomain,
  getSiteById as getStaticSiteById,
} from "@/config/sites";
import type { SiteRow } from "@/types/database";
import type { SiteDefinition } from "@/config/site-definition";

export interface UnifiedSiteConfig {
  /** Database UUID (null if config-only) */
  dbId: string | null;
  /** Site slug / identifier */
  slug: string;
  /** Display name */
  name: string;
  /** Primary domain */
  domain: string;
  /** Language code */
  language: string;
  /** Text direction */
  direction: "ltr" | "rtl";
  /** Whether the site is active */
  isActive: boolean;
  /** Source of the resolved config */
  source: "database" | "config";
  /** Raw DB row (when resolved from DB) */
  dbRow: SiteRow | null;
  /** Raw static config (when resolved from TS) */
  staticConfig: SiteDefinition | null;
}

/**
 * Resolve a site by domain — DB first, then static TS config fallback.
 */
export async function resolveSiteByDomain(domain: string): Promise<UnifiedSiteConfig | null> {
  // 1. Try DB
  try {
    const row = await getSiteRowByDomain(domain);
    if (row) {
      return dbRowToUnified(row);
    }
  } catch {
    // DB unreachable — fall through to static config
  }

  // 2. Fall back to static TS config
  const staticSite = getStaticSiteByDomain(domain);
  if (staticSite) {
    return staticToUnified(staticSite);
  }

  return null;
}

/**
 * Resolve a site by slug — DB first, then static TS config fallback.
 */
export async function resolveSiteBySlug(slug: string): Promise<UnifiedSiteConfig | null> {
  // 1. Try DB
  try {
    const row = await getSiteRowBySlug(slug);
    if (row) {
      return dbRowToUnified(row);
    }
  } catch {
    // DB unreachable — fall through to static config
  }

  // 2. Fall back to static TS config
  const staticSite = getStaticSiteById(slug);
  if (staticSite) {
    return staticToUnified(staticSite);
  }

  return null;
}

function dbRowToUnified(row: SiteRow): UnifiedSiteConfig {
  return {
    dbId: row.id,
    slug: row.slug,
    name: row.name,
    domain: row.domain,
    language: row.language,
    direction: row.direction,
    isActive: row.is_active,
    source: "database",
    dbRow: row,
    staticConfig: null,
  };
}

function staticToUnified(site: SiteDefinition): UnifiedSiteConfig {
  return {
    dbId: null,
    slug: site.id,
    name: site.name,
    domain: site.domain,
    language: site.language,
    direction: site.direction,
    isActive: true, // static configs are always considered active
    source: "config",
    dbRow: null,
    staticConfig: site,
  };
}
