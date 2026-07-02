import { getSiteRowBySlug, getSiteRowBySlugWithClient, upsertConfigSite } from "@/lib/dal/sites";
// Privileged gateway: resolving (and lazily provisioning) the active site is a
// control-plane read/write against the global `sites` registry, which RLS
// restricts to service_role for writes. This mirrors how requireAdmin() in
// lib/admin-guard.ts resolves the active site for /api/admin/* routes — it also
// reads `sites` with the privileged client. site-resolver.ts is therefore on
// the SERVICE_ROLE_IMPORT_ALLOWLIST. It is only reached from authenticated
// admin Server Components that have already passed getAdminSession().
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { getSiteById, toSiteRow } from "@/config/sites";
import { shouldSkipDbCall } from "@/lib/db-available";
import { logger } from "@/lib/logger";
import type { SiteRow } from "@/types/database";

/** Privileged client getter with a stable caller label for usage auditing. */
const privileged = () => getPrivilegedSupabaseClient("site-resolver");

/**
 * Resolve a site slug to its DB `sites` row.
 *
 * The lookup uses the privileged (service-role) client so resolution never
 * depends on tenant-scoped RLS — the admin API routes resolve the active site
 * the same way (see `requireAdmin` in lib/admin-guard.ts).
 *
 * Historically this read used the tenant client and simply returned `null` when
 * a slug had no DB row. Because the admin layout treats static-config sites
 * (config/sites/*) as first-class and lets an admin select one, every
 * site-scoped admin page then threw "Site not found in database" and rendered
 * the dashboard error boundary for a perfectly valid, selected site that had
 * not yet been seeded into the `sites` table (e.g. migration 00014 seeds some
 * sites via `UPDATE ... WHERE slug = …`, which is a no-op on a fresh DB, and
 * `ai-compared` is only seeded by a separate script).
 *
 * To make the dashboard work end-to-end, a known static-config site that is not
 * yet in the DB is auto-provisioned from the TS config (the single source of
 * truth, via `toSiteRow`). Returns `null` only when the slug is neither in the
 * DB nor a known static site (or when the DB is not configured at all).
 *
 * Note on tenant isolation: the `sites` registry is global and has no `site_id`
 * column of its own. This resolver *produces* the site_id (the returned
 * `row.id`) that every other tenant-scoped DAL call then uses to enforce
 * isolation, which is exactly why its registry reads/writes go through the
 * `unsafeNoSiteFilter()` opt-out in lib/dal/sites.ts.
 */
export async function resolveDbSiteRow(slug: string): Promise<SiteRow | null> {
  // No DB configured (or we are inside `next build` static generation): there
  // is nothing to resolve and nothing to provision.
  if (shouldSkipDbCall()) return null;

  // Authoritative read via the privileged client (bypasses RLS for this
  // control-plane lookup).
  const existing = await getSiteRowBySlugWithClient(slug, privileged);
  if (existing) return existing;

  // Not in the DB yet — provision it from static config if this is a known,
  // configured site. Unknown slugs (e.g. a stale cookie pointing at a deleted
  // site) resolve to null and let the caller decide what to do.
  const staticSite = getSiteById(slug);
  if (!staticSite) return null;

  try {
    return await upsertConfigSite(toSiteRow(staticSite), privileged);
  } catch (err) {
    // A concurrent request may have provisioned the row between our read and
    // our write (unique-slug conflict), or the write may have failed
    // transiently — re-read once before surfacing the error.
    const reread = await getSiteRowBySlugWithClient(slug, privileged);
    if (reread) return reread;
    logger.error("[site-resolver] failed to provision static-config site", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Resolves a site slug (e.g. "crypto-tools") to its database UUID.
 *
 * Auto-provisions a `sites` row for a known static-config site that has not
 * been seeded yet, so the admin dashboard never hard-crashes on a valid,
 * selectable site. Throws only when the slug is neither in the DB nor a known
 * static site (or the DB is unavailable) — callers treat that as "pick a site".
 *
 * NOTE: this is the only public export that triggers provisioning. Admin-only.
 */
export async function resolveDbSiteId(slug: string): Promise<string> {
  const row = await resolveDbSiteRow(slug);
  if (!row) {
    throw new Error(`Site not found in database for slug: ${slug}`);
  }
  return row.id;
}

/**
 * Resolves a slug to a full SiteRow from the database.
 *
 * READ-ONLY — does not auto-provision. Used by public page layouts
 * (app/layout.tsx, app/manifest.ts, app/apple-icon.tsx) and any other
 * non-admin caller that only needs DB metadata as a best-effort enrichment.
 * Returns null gracefully when the row does not exist (e.g. before the seed
 * migration has run) so callers can fall back to static config.
 *
 * Admin paths that need the DB UUID (and the guarantee that the row exists)
 * must use `resolveDbSiteId`, which calls `resolveDbSiteRow` and provisions.
 */
export async function resolveDbSiteBySlug(slug: string): Promise<SiteRow | null> {
  if (shouldSkipDbCall()) return null;
  // Cached, tenant-client read via getSiteRowBySlug (unstable_cache, revalidate
  // 10s). This runs on EVERY public render — app/layout.tsx, app/manifest.ts,
  // app/apple-icon.tsx all call it — so it must stay on the cached path and must
  // NOT use the uncached privileged client: an un-deduplicated Supabase
  // round-trip per render inflates TTFB on every page (in CI the call hits the
  // placeholder Supabase URL) and regresses the Lighthouse document-latency /
  // LCP budget. Provisioning is admin-only and lives in resolveDbSiteId ->
  // resolveDbSiteRow, which keeps using the privileged client above.
  return getSiteRowBySlug(slug);
}
