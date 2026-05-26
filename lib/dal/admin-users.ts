import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { logger } from "@/lib/logger";

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
  totp_failed_attempts: number;
  totp_locked_until: string | null;
  login_failed_attempts: number;
  login_locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export type AdminUserPublic = Omit<
  AdminUserRow,
  | "password_hash"
  | "totp_secret"
  | "totp_failed_attempts"
  | "totp_locked_until"
  | "login_failed_attempts"
  | "login_locked_until"
>;

const TABLE = "admin_users";

/** Find an active admin user by email (for login) */
export async function getAdminUserByEmail(
  email: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserRow | null> {
  const sb = await getClient();
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
export async function getAdminUserById(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserPublic | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(
      "id, email, name, role, is_active, totp_enabled, totp_verified_at, created_at, updated_at",
    )
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AdminUserPublic>(data);
}

/** List all admin users (excludes password_hash for safety) */
export async function listAdminUsers(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserPublic[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(
      "id, email, name, role, is_active, totp_enabled, totp_verified_at, created_at, updated_at",
    )
    .order("created_at", { ascending: true });

  if (error) throw error;
  return assertRows<AdminUserPublic>(data);
}

/** Create a new admin user */
export async function createAdminUser(
  input: {
    email: string;
    password_hash: string;
    name: string;
    role?: "admin" | "super_admin";
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserRow> {
  const sb = await getClient();
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
      | "totp_failed_attempts"
      | "totp_locked_until"
      | "login_failed_attempts"
      | "login_locked_until"
    >
  >,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserRow> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .update(input as any)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return assertRow<AdminUserRow>(data, "AdminUser");
}

/**
 * SECURITY-FIX: Atomically increment login_failed_attempts to prevent race condition (R10-004 / CWE-362).
 * Uses Supabase RPC to perform atomic increment and conditional lockout in a single DB round-trip.
 * Falls back to non-atomic update if the RPC function doesn't exist yet.
 */
export async function incrementLoginFailedAttempts(
  id: string,
  lockoutThreshold: number = 10,
  lockoutDurationMs: number = 60 * 60 * 1000,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ attempts: number; locked: boolean }> {
  const sb = await getClient();

  // Try atomic RPC first (requires DB function: increment_login_failed_attempts)
  const { data, error } = await sb.rpc("increment_login_failed_attempts", {
    user_id: id,
    lockout_threshold: lockoutThreshold,
    lockout_duration_ms: lockoutDurationMs,
  });

  if (!error && data) {
    return { attempts: data.attempts, locked: data.locked };
  }

  // RC-004: Only fall back for missing function (42883). All other RPC errors
  // (permissions, timeouts, transient failures) must fail closed to prevent
  // race-condition bypass of the lockout counter.
  if (error && error.code !== "42883") {
    logger.error("increment_login_failed_attempts RPC failed; refusing degraded lockout", {
      userId: id,
      code: error.code,
      message: error.message,
    });
    throw error;
  }

  // Fallback: non-atomic read-then-write (only when RPC function is not yet deployed)
  logger.warn("increment_login_failed_attempts RPC missing (42883); using non-atomic fallback", {
    userId: id,
  });

  const { data: user, error: readErr } = await sb
    .from(TABLE)
    .select("login_failed_attempts")
    .eq("id", id)
    .single();

  if (readErr) throw readErr;

  const attempts = ((user as any)?.login_failed_attempts ?? 0) + 1;
  const updates: { login_failed_attempts: number; login_locked_until?: string | null } = {
    login_failed_attempts: attempts,
  };
  if (attempts >= lockoutThreshold) {
    updates.login_locked_until = new Date(Date.now() + lockoutDurationMs).toISOString();
  }

  const { error: writeErr } = await sb.from(TABLE).update(updates).eq("id", id);
  if (writeErr) throw writeErr;

  return { attempts, locked: attempts >= lockoutThreshold };
}

/**
 * AUDIT-FIX A3-002/A1-006: Atomically increment totp_failed_attempts to prevent
 * race condition from concurrent TOTP attempts undercounting lockout.
 * Uses Supabase RPC for atomicity; falls back to non-atomic update if RPC unavailable.
 */
export async function incrementTotpFailedAttempts(
  id: string,
  lockoutThreshold: number = 10,
  lockoutDurationMs: number = 60 * 60 * 1000,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<{ attempts: number; locked: boolean }> {
  const sb = await getClient();

  const { data, error } = await sb.rpc("increment_totp_failed_attempts", {
    user_id: id,
    lockout_threshold: lockoutThreshold,
    lockout_duration_ms: lockoutDurationMs,
  });

  if (!error && data) {
    return { attempts: data.attempts, locked: data.locked };
  }

  // RC-004: Only fall back for missing function (42883). All other RPC errors
  // must fail closed to prevent race-condition bypass of TOTP lockout.
  if (error && error.code !== "42883") {
    logger.error("increment_totp_failed_attempts RPC failed; refusing degraded lockout", {
      userId: id,
      code: error.code,
      message: error.message,
    });
    throw error;
  }

  // Fallback: non-atomic read-then-write (only when RPC function is not yet deployed)
  logger.warn("increment_totp_failed_attempts RPC missing (42883); using non-atomic fallback", {
    userId: id,
  });

  const { data: user, error: readErr } = await sb
    .from(TABLE)
    .select("totp_failed_attempts")
    .eq("id", id)
    .single();

  if (readErr) throw readErr;

  const attempts = ((user as any)?.totp_failed_attempts ?? 0) + 1;
  const updates: { totp_failed_attempts: number; totp_locked_until?: string | null } = {
    totp_failed_attempts: attempts,
  };
  if (attempts >= lockoutThreshold) {
    updates.totp_locked_until = new Date(Date.now() + lockoutDurationMs).toISOString();
  }

  const { error: writeErr } = await sb.from(TABLE).update(updates).eq("id", id);
  if (writeErr) throw writeErr;

  return { attempts, locked: attempts >= lockoutThreshold };
}

/** Delete an admin user */
export async function deleteAdminUser(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Count admin users (to check if any exist) */
export async function countAdminUsers(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<number> {
  const sb = await getClient();
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
export async function hasAnotherActiveSuperAdmin(
  excludingId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<boolean> {
  const sb = await getClient();
  const { count, error } = await sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("is_active", true)
    .neq("id", excludingId);

  if (error) throw error;
  return (count ?? 0) > 0;
}
