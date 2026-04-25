import { getTenantClient } from "@/lib/supabase-server";
import { assertRows, rowOrNull } from "./type-guards";

export interface AdminSiteMembershipRow {
  id: string;
  admin_user_id: string;
  site_id: string;
  created_at: string;
}

const TABLE = "admin_site_memberships";

/**
 * Check whether an admin user has membership for the given site (by DB UUID).
 * Returns the membership row if it exists, or null.
 */
export async function getAdminSiteMembership(
  adminUserId: string,
  siteId: string,
): Promise<AdminSiteMembershipRow | null> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
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
): Promise<AdminSiteMembershipRow[]> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("admin_user_id", adminUserId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<AdminSiteMembershipRow>(data);
}

/**
 * Grant an admin user membership for a site (idempotent).
 */
export async function grantAdminSiteMembership(
  adminUserId: string,
  siteId: string,
): Promise<AdminSiteMembershipRow> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .upsert(
      { admin_user_id: adminUserId, site_id: siteId },
      { onConflict: "admin_user_id,site_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return data as AdminSiteMembershipRow;
}

/**
 * List all admin site memberships across all admin users, joined with the
 * corresponding site slug. Used by the admin users table to render the
 * "Sites access" column without issuing one query per user.
 */
export async function listAllAdminSiteMembershipsWithSlugs(): Promise<
  Array<{ admin_user_id: string; site_id: string; site_slug: string }>
> {
  const sb = await getTenantClient();
  const { data, error } = await sb.from(TABLE).select("admin_user_id, site_id, sites!inner(slug)");

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

/**
 * Revoke an admin user's membership for a site.
 */
export async function revokeAdminSiteMembership(
  adminUserId: string,
  siteId: string,
): Promise<void> {
  const sb = await getTenantClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    .eq("admin_user_id", adminUserId)
    .eq("site_id", siteId);

  if (error) throw error;
}
