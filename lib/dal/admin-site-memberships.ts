import { assertRows, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import type { AdminSiteMembershipRow } from "@/types/database";
// M2: admin_site_memberships is global authz metadata; RLS grants access only
// to service_role. The per-tenant client returns zero rows and would cause
// requireAdmin() to reject non-super admins. Use the privileged client for
// membership checks, with the site_id filter applied in code below.
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import

interface CrossTenantBuilder {
  unsafeNoSiteFilter(): CrossTenantBuilder;
  eq(col: string, val: string): CrossTenantBuilder;
  order(col: string, opts: { ascending: boolean }): CrossTenantBuilder;
  single(): Promise<{ data: unknown; error: { code: string; message: string } | null }>;
  then: Promise<{ data: unknown; error: { code: string; message: string } | null }>["then"];
}

const TABLE = "admin_site_memberships";
const LIST_COLUMNS = "id, admin_user_id, site_id, created_at" as const;

/**
 * Default client for membership lookups. The tenant client cannot read this
 * table, so all membership checks default to the privileged client.
 */
const defaultMembershipClientGetter: DalClientGetter = () =>
  getPrivilegedSupabaseClient("admin-site-memberships:authz");

/**
 * Check whether an admin user has membership for the given site (by DB UUID).
 * Returns the membership row if it exists, or null.
 */
export async function getAdminSiteMembership(
  adminUserId: string,
  siteId: string,
  getClient: DalClientGetter = defaultMembershipClientGetter,
): Promise<AdminSiteMembershipRow | null> {
  const sb = await getClient();
  const { data, error } = await (
    sb.from(TABLE).select(LIST_COLUMNS) as unknown as CrossTenantBuilder
  )
    // SAFE: admin-to-site membership rows are global authz metadata, not tenant content.
    .unsafeNoSiteFilter()
    .eq("admin_user_id", adminUserId)
    .eq("site_id", siteId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AdminSiteMembershipRow>(data);
}

/**
 * List all site memberships for an admin user.
 */
export async function listAdminSiteMemberships(
  adminUserId: string,
  getClient: DalClientGetter = defaultMembershipClientGetter,
): Promise<AdminSiteMembershipRow[]> {
  const sb = await getClient();
  const { data, error } = await (
    sb.from(TABLE).select(LIST_COLUMNS) as unknown as CrossTenantBuilder
  )
    // SAFE: listing an admin's memberships necessarily spans every site they can access.
    .unsafeNoSiteFilter()
    .eq("admin_user_id", adminUserId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<AdminSiteMembershipRow>(data);
}

/**
 * List all admin site memberships across all admin users, joined with the
 * corresponding site slug. Used by the admin users table to render the
 * "Sites access" column without issuing one query per user.
 */
const WITH_SLUG_COLUMNS = "admin_user_id, site_id, sites!inner(slug)" as const;

/** M2: cross-tenant read → service-role client (mirrors lib/dal/admin-users). */
const listAllMembershipsClient: DalClientGetter = () =>
  getPrivilegedSupabaseClient("admin-site-memberships:list-all");

export async function listAllAdminSiteMembershipsWithSlugs(
  getClient: DalClientGetter = listAllMembershipsClient,
): Promise<Array<{ admin_user_id: string; site_id: string; site_slug: string }>> {
  const sb = await getClient();
  // M2: this query intentionally returns every admin's memberships across all
  // sites for the (super_admin-only) users table. Without the service-role
  // client RLS empties it; without the opt-out the tenant Proxy rejects it.
  const { data, error } = await (
    sb.from(TABLE).select(WITH_SLUG_COLUMNS) as unknown as CrossTenantBuilder
  )
    // SAFE: cross-tenant by design — the only caller is the super_admin Users page.
    .unsafeNoSiteFilter();

  if (error) throw error;
  const rows = (data ?? []) as Array<{
    admin_user_id: string;
    site_id: string;
    sites: { slug: string } | { slug: string }[] | null;
  }>;

  return rows.map((r) => {
    const site = Array.isArray(r.sites) ? r.sites[0] : r.sites;
    return {
      admin_user_id: r.admin_user_id,
      site_id: r.site_id,
      site_slug: site?.slug ?? "",
    };
  });
}
