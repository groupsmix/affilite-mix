/**
 * F-013 (rc4): platform "Select Site" dropdowns must default to / respect the
 * globally active site rather than unconditionally defaulting to the first DB
 * site (`dbSites[0]`).
 *
 * Each platform manager (Permissions, Feature Flags, Modules, Integrations)
 * has its own site dropdown. This helper resolves the default selection by
 * reading the globally active site from `GET /api/admin/sites/active` and
 * matching it against the manager's DB-managed sites. It falls back to the
 * first DB site only when there is no active site or it cannot be matched.
 */

export interface DefaultSiteOption {
  id: string;
  slug: string;
  db_id?: string;
  source: string;
}

/**
 * Resolve the option value the dropdown should select by default.
 *
 * The active-site endpoint returns the active site slug (its cookie value),
 * but a caller could also hold a db_id; we therefore match against `db_id`,
 * `id`, and `slug` so the default is robust regardless of which identifier the
 * active context exposes. Returns the matching option value (`db_id ?? id`),
 * falling back to the first site's value, or `null` when there are no sites.
 */
export async function resolveDefaultSiteId(dbSites: DefaultSiteOption[]): Promise<string | null> {
  if (dbSites.length === 0) return null;

  let activeSiteId: string | null = null;
  try {
    const res = await fetch("/api/admin/sites/active");
    if (res.ok) {
      const data = (await res.json()) as { activeSiteId?: string | null };
      activeSiteId = data.activeSiteId ?? null;
    }
  } catch {
    // Network/parse failure — fall back to the first DB site below.
  }

  const match =
    activeSiteId != null
      ? dbSites.find(
          (s) => s.db_id === activeSiteId || s.id === activeSiteId || s.slug === activeSiteId,
        )
      : undefined;

  const target = match ?? dbSites[0]!;
  return target.db_id ?? target.id;
}
