/**
 * Data Access Layer — Roles & Permissions
 *
 * Site-scoped RBAC with feature+action granularity.
 * A user can have a different role per site.
 */

// F-11: Removed React cache to enable AbortSignal propagation.
// Cache was preventing timeout signals from reaching Supabase queries.
// Performance impact is minimal for authz checks which are already fast.
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import type {
  RoleRow,
  PermissionRow,
  UserSiteRoleRow,
  PermissionFeature,
  PermissionAction,
} from "@/types/database";
import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { authzPrimaryRead } from "@/lib/read-after-write";

// A23-01: Explicit column lists for all three tables in this DAL.
const ROLE_COLUMNS = "id, name, label, description, is_system, created_at" as const;
const PERMISSION_COLUMNS = "id, feature, action, description" as const;
const USER_SITE_ROLE_COLUMNS = "id, user_id, site_id, role_id, created_at" as const;

interface AdminRoleLookup {
  role: string;
}

/* ------------------------------------------------------------------ */
/*  Roles                                                              */
/* ------------------------------------------------------------------ */

/** List all roles */
export async function listRoles(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<RoleRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("roles")
    .select(ROLE_COLUMNS)
    // SAFE: `roles` is a global RBAC table with no `site_id`; privileged admin read (no-op on tenant).
    .unsafeNoSiteFilter()
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<RoleRow>(data);
}

/** Get a role by name */
export async function getRoleByName(
  name: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<RoleRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("roles")
    .select(ROLE_COLUMNS)
    // SAFE: `roles` is a global RBAC table with no `site_id`; privileged admin lookup (no-op on tenant).
    .unsafeNoSiteFilter()
    .eq("name", name)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<RoleRow>(data);
}

/* ------------------------------------------------------------------ */
/*  Permissions                                                        */
/* ------------------------------------------------------------------ */

/** List all permissions */
export async function listPermissions(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<PermissionRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("permissions")
    .select(PERMISSION_COLUMNS)
    // SAFE: `permissions` is a global RBAC table with no `site_id`; privileged admin read (no-op on tenant).
    .unsafeNoSiteFilter()
    .order("feature", { ascending: true });

  if (error) throw error;
  return assertRows<PermissionRow>(data);
}

/* ------------------------------------------------------------------ */
/*  User-Site-Role assignments                                         */
/* ------------------------------------------------------------------ */

/** List all role assignments for a site */
export async function listSiteUserRoles(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<UserSiteRoleRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("user_site_roles")
    .select(USER_SITE_ROLE_COLUMNS)
    .eq("site_id", siteId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<UserSiteRoleRow>(data);
}

/** Get a user's role for a specific site */
// F-11: Removed cache to support AbortSignal propagation
async function getUserSiteRole(
  userId: string,
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
  signal?: AbortSignal,
): Promise<UserSiteRoleRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("user_site_roles")
    .select(USER_SITE_ROLE_COLUMNS)
    .eq("user_id", userId)
    .eq("site_id", siteId)
    .abortSignal(signal)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<UserSiteRoleRow>(data);
}

/** Assign a role to a user for a specific site (upsert) */
export async function assignUserSiteRole(
  input: {
    user_id: string;
    site_id: string;
    role_id: string;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<UserSiteRoleRow> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("user_site_roles")
    .upsert(
      {
        user_id: input.user_id,
        site_id: input.site_id,
        role_id: input.role_id,
      },
      { onConflict: "user_id,site_id" },
    )
    .select()
    .single();

  if (error) throw error;
  return assertRow<UserSiteRoleRow>(data, "UserSiteRole");
}

/** Remove a user's role for a specific site */
export async function removeUserSiteRole(
  userId: string,
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb
    .from("user_site_roles")
    .delete()
    .eq("user_id", userId)
    .eq("site_id", siteId);

  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/*  Permission checks                                                  */
/* ------------------------------------------------------------------ */

/**
 * Check if a user has a specific permission for a site.
 * Checks the user's role on that site, then looks up whether that role
 * has the requested feature+action permission.
 *
 * Role precedence:
 * - super_admin / owner → always returns true (global bypass)
 * - Any other user with no user_site_roles row for this site → returns false
 * - Otherwise: checks whether the assigned site role has the requested permission
 *
 * Global `admin` role no longer silently grants cross-site access.
 * To grant an admin access to a site, insert a user_site_roles row for them.
 */
// 1. Check global admin_users.role for backward compatibility
// F-11: Removed cache to support AbortSignal propagation
async function getGlobalRole(
  userId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
  signal?: AbortSignal,
): Promise<string | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("admin_users")
    .select("role")
    // SAFE: `admin_users.role` is global control-plane state used before tenant authz.
    .unsafeNoSiteFilter()
    .eq("id", userId)
    .abortSignal(signal)
    .single();
  if (error) throw error;
  return (data as AdminRoleLookup | null)?.role ?? null;
}

// F-11: Removed cache to support AbortSignal propagation
async function getRolePermissionCheck(
  roleId: string,
  feature: string,
  action: string,
  getClient: DalClientGetter = defaultDalClientGetter,
  signal?: AbortSignal,
): Promise<boolean> {
  const sb = await getClient();
  // We can do this in one join query instead of two to save a round-trip
  const { data, error } = await sb
    .from("permissions")
    .select("id, role_permissions!inner(role_id)")
    .eq("feature", feature)
    .eq("action", action)
    .eq("role_permissions.role_id", roleId)
    .abortSignal(signal)
    .single();

  if (error && error.code === "PGRST116") return false;
  if (error) throw error;
  return Boolean(data);
}

export async function hasPermission(
  userId: string,
  siteId: string,
  feature: PermissionFeature,
  action: PermissionAction,
  getClient: DalClientGetter = defaultDalClientGetter,
  signal?: AbortSignal,
): Promise<boolean> {
  // A30-006: Authz reads must use primary to prevent stale replica data
  // from incorrectly granting/revoking access
  // F-11: Accept AbortSignal to allow timeout propagation from middleware
  const globalRole = await authzPrimaryRead(() => getGlobalRole(userId, getClient, signal));

  // Super admin and owner bypass all permission checks
  if (globalRole === "super_admin" || globalRole === "owner") return true;

  // 2. Check site-scoped role — also primary read for authz consistency
  const userSiteRole = await authzPrimaryRead(() =>
    getUserSiteRole(userId, siteId, getClient, signal),
  );
  if (!userSiteRole) {
    // No site-scoped role assigned: deny access.
    return false;
  }

  // 3. Check if the assigned role has the requested permission
  return await authzPrimaryRead(() =>
    getRolePermissionCheck(userSiteRole.role_id, feature, action, getClient, signal),
  );
}
