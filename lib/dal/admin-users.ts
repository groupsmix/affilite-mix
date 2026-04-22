import { getServiceClient } from "@/lib/supabase-server";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

export interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "admin" | "super_admin";
  is_active: boolean;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AdminUserPublic = Omit<AdminUserRow, "password_hash" | "totp_secret">;

const TABLE = "admin_users";

/** Find an active admin user by email (for login) */
export async function getAdminUserByEmail(email: string): Promise<AdminUserRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AdminUserRow>(data);
}

/** Find an admin user by ID (excludes password_hash for safety) */
export async function getAdminUserById(id: string): Promise<AdminUserPublic | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, email, name, role, is_active, created_at, updated_at")
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AdminUserPublic>(data);
}

/** List all admin users (excludes password_hash for safety) */
export async function listAdminUsers(): Promise<AdminUserPublic[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, email, name, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<AdminUserPublic>(data);
}

/** Create a new admin user */
export async function createAdminUser(input: {
  email: string;
  password_hash: string;
  name: string;
  role?: "admin" | "super_admin";
}): Promise<AdminUserRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      email: input.email.toLowerCase(),
      password_hash: input.password_hash,
      name: input.name,
      role: input.role ?? "admin",
    })
    .select()
    .single();

  if (error) throw error;
  return assertRow<AdminUserRow>(data, "AdminUser");
}

/** Update an admin user */
export async function updateAdminUser(
  id: string,
  input: Partial<
    Pick<
      AdminUserRow,
      | "name"
      | "role"
      | "is_active"
      | "password_hash"
      | "totp_secret"
      | "totp_enabled"
      | "totp_verified_at"
    >
  >,
): Promise<AdminUserRow> {
  const sb = getServiceClient();

  const { data, error } = await sb
    .from(TABLE)
    .update(input as any)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<AdminUserRow>(data, "AdminUser");
}

/** Delete an admin user */
export async function deleteAdminUser(id: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Count admin users (to check if any exist) */
export async function countAdminUsers(): Promise<number> {
  const sb = getServiceClient();
  const { count, error } = await sb.from(TABLE).select("*", { count: "exact", head: true });

  if (error) {
    // Table might not exist yet — fall back to 0
    if (error.code === "42P01" || error.message?.includes("does not exist")) {
      return 0;
    }
    throw error;
  }
  return count ?? 0;
}

/**
 * Check if the admin_users table exists and has any rows.
 * Returns false if the table doesn't exist or has no users.
 */
export async function hasAdminUsers(): Promise<boolean> {
  try {
    const count = await countAdminUsers();
    return count > 0;
  } catch {
    return false;
  }
}

/**
 * Returns true iff there is at least one OTHER active super_admin besides
 * the one identified by `excludingId`. Used to prevent deleting, deactivating,
 * or demoting the final active super_admin.
 */
export async function hasAnotherActiveSuperAdmin(excludingId: string): Promise<boolean> {
  const sb = getServiceClient();
  const { count, error } = await sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("is_active", true)
    .neq("id", excludingId);

  if (error) throw error;
  return (count ?? 0) > 0;
}
