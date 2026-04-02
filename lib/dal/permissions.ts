/**
 * Data Access Layer — Roles & Permissions
 *
 * Site-scoped RBAC with feature+action granularity.
 * A user can have a different role per site.
 */

import { getServiceClient } from "@/lib/supabase-server";
import type {
  RoleRow,
  PermissionRow,
  UserSiteRoleRow,
  PermissionFeature,
  PermissionAction,
} from "@/types/database";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

/* ------------------------------------------------------------------ */
/*  Roles                                                              */
/* ------------------------------------------------------------------ */

/** List all roles */
export async function listRoles(): Promise<RoleRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb.from("roles").select("*").order("name", { ascending: true });

  if (error) throw error;
  return assertRows<RoleRow>(data);
}

/** Get a role by name */
export async function getRoleByName(name: string): Promise<RoleRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb.from("roles").select("*").eq("name", name).single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<RoleRow>(data);
}

/* ------------------------------------------------------------------ */
/*  Permissions                                                        */
/* ------------------------------------------------------------------ */

/** List all permissions */
export async function listPermissions(): Promise<PermissionRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("permissions")
    .select("*")
    .order("feature", { ascending: true });

  if (error) throw error;
  return assertRows<PermissionRow>(data);
}

/** Get permissions for a role */
export async function getPermissionsForRole(roleId: string): Promise<PermissionRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("role_permissions")
    .select("permission_id")
    .eq("role_id", roleId);

  if (error) throw error;
  const permIds = (data as { permission_id: string }[]).map((d) => d.permission_id);
  if (permIds.length === 0) return [];

  const { data: perms, error: permError } = await sb
    .from("permissions")
    .select("*")
    .in("id", permIds);

  if (permError) throw permError;
  return assertRows<PermissionRow>(perms);
}

/* ------------------------------------------------------------------ */
/*  User-Site-Role assignments                                         */
/* ------------------------------------------------------------------ */

/** List all role assignments for a user */
export async function listUserSiteRoles(userId: string): Promise<UserSiteRoleRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("user_site_roles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<UserSiteRoleRow>(data);
}

/** List all role assignments for a site */
export async function listSiteUserRoles(siteId: string): Promise<UserSiteRoleRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("user_site_roles")
    .select("*")
    .eq("site_id", siteId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<UserSiteRoleRow>(data);
}

/** Get a user's role for a specific site */
export async function getUserSiteRole(
  userId: string,
  siteId: string,
): Promise<UserSiteRoleRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("user_site_roles")
    .select("*")
    .eq("user_id", userId)
    .eq("site_id", siteId)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<UserSiteRoleRow>(data);
}

/** Assign a role to a user for a specific site (upsert) */
export async function assignUserSiteRole(input: {
  user_id: string;
  site_id: string;
  role_id: string;
}): Promise<UserSiteRoleRow> {
  const sb = getServiceClient();
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
export async function removeUserSiteRole(userId: string, siteId: string): Promise<void> {
  const sb = getServiceClient();
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
 * Falls back to the user's global admin_users.role for backward compatibility:
 * - super_admin/owner bypass → always returns true
 * - admin → checks site-scoped role if assigned, otherwise allows
 */
export async function hasPermission(
  userId: string,
  siteId: string,
  feature: PermissionFeature,
  action: PermissionAction,
): Promise<boolean> {
  const sb = getServiceClient();

  // 1. Check global admin_users.role for backward compatibility
  const { data: adminUser, error: adminError } = await sb
    .from("admin_users")
    .select("role")
    .eq("id", userId)
    .single();

  if (adminError) throw adminError;
  const globalRole = (adminUser as { role: string } | null)?.role;

  // Super admin and owner bypass all permission checks
  if (globalRole === "super_admin" || globalRole === "owner") return true;

  // 2. Check site-scoped role
  const userSiteRole = await getUserSiteRole(userId, siteId);
  if (!userSiteRole) {
    // No site-scoped role: global admin gets full access, others denied
    return globalRole === "admin";
  }

  // 3. Check if the assigned role has the requested permission
  const { data: permCheck, error: permError } = await sb
    .from("permissions")
    .select("id")
    .eq("feature", feature)
    .eq("action", action)
    .single();

  if (permError && permError.code === "PGRST116") return false;
  if (permError) throw permError;

  const permissionId = (permCheck as { id: string }).id;

  const { data: rolePermCheck, error: rpError } = await sb
    .from("role_permissions")
    .select("role_id")
    .eq("role_id", userSiteRole.role_id)
    .eq("permission_id", permissionId)
    .single();

  if (rpError && rpError.code === "PGRST116") return false;
  if (rpError) throw rpError;

  return rolePermCheck !== null;
}
