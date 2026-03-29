import { getServiceClient } from "@/lib/supabase-server";

export interface AdminUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "admin" | "super_admin";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const TABLE = "admin_users";

/** Find an active admin user by email (for login) */
export async function getAdminUserByEmail(
  email: string,
): Promise<AdminUserRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return (data as unknown as AdminUserRow) ?? null;
}

/** List all admin users */
export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data as AdminUserRow[];
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
    } as never)
    .select()
    .single();

  if (error) throw error;
  return data as AdminUserRow;
}

/** Update an admin user */
export async function updateAdminUser(
  id: string,
  input: Partial<Pick<AdminUserRow, "name" | "role" | "is_active" | "password_hash">>,
): Promise<AdminUserRow> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from(TABLE)
    .update(input as never)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as AdminUserRow;
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
  const { count, error } = await sb
    .from(TABLE)
    .select("*", { count: "exact", head: true });

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
 * Returns false if the table doesn't exist or has no users,
 * meaning the system should fall back to ADMIN_PASSWORD.
 */
export async function hasAdminUsers(): Promise<boolean> {
  try {
    const count = await countAdminUsers();
    return count > 0;
  } catch {
    return false;
  }
}
