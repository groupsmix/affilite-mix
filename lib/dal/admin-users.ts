// DESIGN: No site_id filtering — admin users are global accounts; membership scoping is handled by the authz layer.
//
// CLIENT DEFAULT: `admin_users` RLS grants access to service_role only
// (migrations 00002 / 00040 "admin_users_service_all"), so the tenant client
// cannot read or write this table — a tenant-client call returns zero rows or
// is denied outright, which previously crashed admin Server Components. Every
// helper below therefore defaults to the privileged client via
// `defaultAdminUsersClient`. Request-scoped callers may still pass an explicit
// client (e.g. lib/auth.ts passes a labelled privileged client for the login
// path). This module is on the SERVICE_ROLE_IMPORT_ALLOWLIST
// (lib/security/service-role-allowlist.ts).
import { assertRows, assertRow, rowOrNull } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
// admin_users RLS grants service_role only (migrations 00002 / 00040), so the
// tenant client cannot read this table; this module is on the
// SERVICE_ROLE_IMPORT_ALLOWLIST (lib/security/service-role-allowlist.ts) and is
// reached only from requireAdminSession()/requireAdmin()-gated callers (and the
// rate-limited login path). See the CLIENT DEFAULT note in the file header.
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { clampPagination } from "./pagination-guard";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { emitMetric } from "@/lib/metrics";

/**
 * Default client getter for admin_users operations — the privileged gateway.
 * See the CLIENT DEFAULT note above for why the tenant client cannot be used.
 */
const defaultAdminUsersClient: DalClientGetter = () => getPrivilegedSupabaseClient("admin-users");

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
  // F4: highest TOTP time-step consumed. Strictly greater-than on persist;
  // NULL means "no baseline" — first use after enrollment passes through.
  totp_last_step: number | null;
  totp_failed_attempts: number;
  totp_locked_until: string | null;
  login_failed_attempts: number;
  login_locked_until: string | null;
  // Issue 13: password-reset token (SHA-256 hashed) and its expiry.
  // Included in ALL_COLUMNS so getAdminUserByEmail returns these fields,
  // allowing the forgot-password handler to detect an unexpired pending token.
  reset_token: string | null;
  reset_token_expires_at: string | null;
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
  "id, email, password_hash, name, role, is_active, totp_secret, totp_enabled, totp_verified_at, totp_last_step, totp_failed_attempts, totp_locked_until, login_failed_attempts, login_locked_until, reset_token, reset_token_expires_at, created_at, updated_at" as const;

/** Find an active admin user by email (for login) */
export async function getAdminUserByEmail(
  email: string,
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<AdminUserRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    // SAFE: `admin_users` stores global dashboard identities, not tenant rows.
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
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<AdminUserPublic | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(
      "id, email, name, role, is_active, totp_enabled, totp_verified_at, created_at, updated_at",
    )
    // SAFE: `admin_users` is global auth state shared across all sites.
    .unsafeNoSiteFilter()
    .eq("id", id)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<AdminUserPublic>(data);
}

/** List all admin users (excludes password_hash for safety) */
export async function listAdminUsers(
  opts: { limit?: number; offset?: number } = {},
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<AdminUserPublic[]> {
  const sb = await getClient();
  const { limit, offset } = clampPagination(opts);

  let query = sb
    .from(TABLE)
    .select(
      "id, email, name, role, is_active, totp_enabled, totp_verified_at, created_at, updated_at",
    )
    // SAFE: listing dashboard operators intentionally spans all tenants.
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
  getClient: DalClientGetter = defaultAdminUsersClient,
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
    // SAFE: creating an admin account writes to the global `admin_users` table.
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
      | "totp_last_step"
      | "totp_failed_attempts"
      | "totp_locked_until"
      | "login_failed_attempts"
      | "login_locked_until"
    >
  >,
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<AdminUserRow> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .update(input as Record<string, unknown>)
    // SAFE: updating admin credentials/lockout state targets the global admin table.
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
  getClient: DalClientGetter = defaultAdminUsersClient,
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
    // SAFE: lockout RPC is keyed by global admin user id, not tenant scope.
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
    captureException(error, {
      context: "admin-users.increment-login-failed-attempts-rpc",
      extra: { userId: id, code: error.code },
    });
    emitMetric("admin_auth_rpc_failure_total", 1, {
      method: "increment_login_failed_attempts",
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
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<{ attempts: number; locked: boolean }> {
  const sb = await getClient();

  // F-API-01 / NEW-03: user-scoped lockout RPC (no p_site_id) — opt out of RPC guard.
  const { data, error } = await sb
    .rpc("increment_totp_failed_attempts", {
      user_id: id,
      lockout_threshold: lockoutThreshold,
      lockout_duration_ms: lockoutDurationMs,
    })
    // SAFE: TOTP lockout RPC mutates global admin auth state, not site data.
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
    captureException(error, {
      context: "admin-users.increment-totp-failed-attempts-rpc",
      extra: { userId: id, code: error.code },
    });
    emitMetric("admin_auth_rpc_failure_total", 1, {
      method: "increment_totp_failed_attempts",
    });
    throw error;
  }

  // Unreachable: data is guaranteed non-null when error is null
  return { attempts: 0, locked: false };
}

/**
 * Bug 8 (audit-round2-fixes): Atomically compare-and-set the consumed TOTP
 * time-step on `admin_users.totp_last_step` via the `verify_and_set_totp_step`
 * RPC (migration 2026062302).
 *
 * Closes a TOCTOU race in the previous read-then-write flow: two concurrent
 * requests with the SAME valid 6-digit code both passed the single-use check
 * before either write persisted the new baseline. The RPC performs the
 * compare-and-set in a single statement, so only the FIRST concurrent request
 * can advance the baseline; the second sees zero rows updated.
 *
 * Returns `true` when the step was accepted (first use, or a newer step) and
 * `false` when it was already consumed (replay → caller MUST reject). On RPC
 * error (e.g. the function not yet deployed) this throws so the caller can
 * decide its fail-safe policy — the previous non-atomic update is NOT silently
 * re-introduced, because that path is exactly the race this closes.
 *
 * `expectedStep` and `newStep` are passed separately so a future caller could
 * reserve a step ahead; the login/step-up paths pass `totpResult.step` for
 * both (advance to the just-consumed step).
 */
export async function verifyAndSetTotpStep(
  userId: string,
  expectedStep: number,
  newStep: number,
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<boolean> {
  const sb = await getClient();

  // F-API-01 / NEW-03: user-scoped TOTP RPC (no p_site_id) — opt out of the
  // RPC tenant guard. admin_users is global auth state, not site data.
  const { data, error } = await sb
    .rpc("verify_and_set_totp_step", {
      p_user_id: userId,
      p_expected_step: expectedStep,
      p_new_step: newStep,
    })
    // SAFE: TOTP step CAS mutates global admin auth state, not site data.
    .unsafeNoSiteFilter();

  if (error) {
    logger.error("verify_and_set_totp_step RPC failed", {
      userId,
      code: error.code,
      message: error.message,
    });
    captureException(error, {
      context: "admin-users.verify-and-set-totp-step-rpc",
      extra: { userId, code: error.code },
    });
    emitMetric("admin_auth_rpc_failure_total", 1, {
      method: "verify_and_set_totp_step",
    });
    throw error;
  }

  return Boolean(data);
}

/** Delete an admin user */
export async function deleteAdminUser(
  id: string,
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb
    .from(TABLE)
    .delete()
    // SAFE: deleting an admin account is a global control-plane action.
    .unsafeNoSiteFilter()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Returns true iff there is at least one OTHER active super_admin besides
 * the one identified by `excludingId`. Used to prevent deleting, deactivating,
 * or demoting the final active super_admin.
 */
export async function hasAnotherActiveSuperAdmin(
  excludingId: string,
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<boolean> {
  const sb = await getClient();
  const { count, error } = await sb
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    // SAFE: super-admin quorum is evaluated across the global admin roster.
    .unsafeNoSiteFilter()
    .eq("role", "super_admin")
    .eq("is_active", true)
    .neq("id", excludingId);

  if (error) throw error;
  return (count ?? 0) > 0;
}

/**
 * M3: Batch-resolve admin user ids by email. Used by the audit-log page to map
 * email-shaped actors → admin user ids for the Actor column links. Emails are
 * matched case-insensitively by the caller (which lowercases before calling).
 * Lives here because `admin_users` reads belong on the privileged client owned
 * by this DAL — keeping audit-log.ts free of a direct service-role import.
 */
export async function getAdminUserIdsByEmails(
  emails: readonly string[],
  getClient: DalClientGetter = defaultAdminUsersClient,
): Promise<Array<{ id: string; email: string }>> {
  if (emails.length === 0) return [];
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("id, email")
    // SAFE: admin_users is global auth state shared across all sites.
    .unsafeNoSiteFilter()
    .in("email", emails as string[]);

  if (error) throw error;
  return assertRows<{ id: string; email: string }>(data ?? []);
}
