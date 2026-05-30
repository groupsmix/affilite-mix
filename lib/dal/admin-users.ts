// DESIGN: No site_id filtering — admin users are global accounts; membership scoping is handled by the authz layer.
import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";
import { clampPagination } from "./pagination-guard";
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
const ALL_COLUMNS =
  "id, email, password_hash, name, role, is_active, totp_secret, totp_enabled, totp_verified_at, totp_failed_attempts, totp_locked_until, login_failed_attempts, login_locked_until, reset_token, reset_token_expires_at, created_at, updated_at" as const;

/** Find an active admin user by email (for login) */
export async function getAdminUserByEmail(
  email: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .unsafeNoSiteFilter()
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
    .unsafeNoSiteFilter()
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AdminUserPublic>(data);
}

/** List all admin users (excludes password_hash for safety) */
export async function listAdminUsers(
  opts: { limit?: number; offset?: number } = {},
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<AdminUserPublic[]> {
  const sb = await getClient();
  const { limit, offset } = clampPagination(opts);

  let query = sb
    .from(TABLE)
    .select(
      "id, email, name, role, is_active, totp_enabled, totp_verified_at, created_at, updated_at",
    )
    .unsafeNoSiteFilter()
    .order("created_at", { ascending: true });

  if (offset > 0) {
    query = query.range(offset, offset + limit - 1);
  } else {
    query = query.limit(limit);
  }

  const { data, error } = await query;
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
    .unsafeNoSiteFilter()
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
    .update(input as Record<string, unknown>)
    .unsafeNoSiteFilter()
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
  // F-API-01 / NEW-03: user-scoped lockout RPC (no p_site_id) — opt out of RPC guard.
  const { data, error } = await sb
    .rpc("increment_login_failed_attempts", {
      user_id: id,
      lockout_threshold: lockoutThreshold,
      lockout_duration_ms: lockoutDurationMs,
    })
    .unsafeNoSiteFilter();

  if (!error && data) {
    return { attempts: data.attempts, locked: data.locked };
  }

  // S1-A10-001: All RPC errors (including missing function 42883) must fail
  // closed. The non-atomic fallback had a TOCTOU race condition (CWE-362)
  // that allowed concurrent login attempts to undercount the lockout counter.
  // The RPC function MUST be deployed — there is no safe degraded path.
  if (error) {
    logger.error("increment_login_failed_attempts RPC failed; failing closed", {
      userId: id,
      code: error.code,
      message: error.message,
    });
    throw error;
  }

  // Unreachable: data is guaranteed non-null when error is null
  return { attempts: 0, locked: false };
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

  // F-API-01 / NEW-03: user-scoped lockout RPC (no p_site_id) — opt out of RPC guard.
  const { data, error } = await sb
    .rpc("increment_totp_failed_attempts", {
      user_id: id,
      lockout_threshold: lockoutThreshold,
      lockout_duration_ms: lockoutDurationMs,
    })
    .unsafeNoSiteFilter();

  if (!error && data) {
    return { attempts: data.attempts, locked: data.locked };
  }

  // S1-A10-001: All RPC errors (including missing function 42883) must fail
  // closed. The non-atomic fallback had a TOCTOU race condition (CWE-362)
  // that allowed concurrent TOTP attempts to undercount the lockout counter.
  // The RPC function MUST be deployed — there is no safe degraded path.
  if (error) {
    logger.error("increment_totp_failed_attempts RPC failed; failing closed", {
      userId: id,
      code: error.code,
      message: error.message,
    });
    throw error;
  }

  // Unreachable: data is guaranteed non-null when error is null
  return { attempts: 0, locked: false };
}

/** Delete an admin user */
export async function deleteAdminUser(
  id: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb.from(TABLE).delete().unsafeNoSiteFilter().eq("id", id);
  if (error) throw error;
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
    .unsafeNoSiteFilter()
    .eq("role", "super_admin")
    .eq("is_active", true)
    .neq("id", excludingId);

  if (error) throw error;
  return (count ?? 0) > 0;
}
