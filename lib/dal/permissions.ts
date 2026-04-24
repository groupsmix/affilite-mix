/**
 * Data Access Layer — Roles & Permissions
 *
 * Site-scoped RBAC with feature+action granularity.
 * A user can have a different role per site.
 */

import { cache } from "react";
import { getServiceClient } from "@/lib/supabase-server";
import type {
  RoleRow,
  PermissionRow,
  UserSiteRoleRow,
  PermissionFeature,
  PermissionAction,
} from "@/types/database";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

interface AdminRoleLookup {
  role: string;
}

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
export const getUserSiteRole = cache(async function getUserSiteRole(
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
});

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
 * Role precedence:
 * - super_admin / owner → always returns true (global bypass)
 * - Any other user with no user_site_roles row for this site → returns false
 * - Otherwise: checks whether the assigned site role has the requested permission
 *
 * Global `admin` role no longer silently grants cross-site access.
 * To grant an admin access to a site, insert a user_site_roles row for them.
 */
// 1. Check global admin_users.role for backward compatibility (cached)
const getGlobalRole = cache(async (userId: string) => {
  const sb = getServiceClient();
  const { data, error } = await sb.from("admin_users").select("role").eq("id", userId).single();
  if (error) throw error;
  return (data as AdminRoleLookup | null)?.role;
});

// Cache permission lookups
const getRolePermissionCheck = cache(async (roleId: string, feature: string, action: string) => {
  const sb = getServiceClient();
  // We can do this in one join query instead of two to save a round-trip
  const { data, error } = await sb
    .from("permissions")
    .select("id, role_permissions!inner(role_id)")
    .eq("feature", feature)
    .eq("action", action)
    .eq("role_permissions.role_id", roleId)
    .single();

  if (error && error.code === "PGRST116") return false;
  if (error) throw error;
  return Boolean(data);
});

export async function hasPermission(
  userId: string,
  siteId: string,
  feature: PermissionFeature,
  action: PermissionAction,
): Promise<boolean> {
  const globalRole = await getGlobalRole(userId);

  // Super admin and owner bypass all permission checks
  if (globalRole === "super_admin" || globalRole === "owner") return true;

  // 2. Check site-scoped role
  const userSiteRole = await getUserSiteRole(userId, siteId);
  if (!userSiteRole) {
    // No site-scoped role assigned: deny access.
    return false;
  }

  // 3. Check if the assigned role has the requested permission
  return await getRolePermissionCheck(userSiteRole.role_id, feature, action);
}
