#!/usr/bin/env tsx
/**
 * Bootstrap the initial super_admin into the global `admin_users` table.
 *
 * This is the authoritative bootstrap path invoked by
 * `.github/workflows/admin-bootstrap.yml` (`npx tsx scripts/bootstrap-admin.ts`).
 *
 * WHY THIS EXISTS (admin-launch-blockers F-015 / F-016, task 11.1):
 *   The Admin Users page reads from `admin_users` via the privileged client
 *   (`listAdminUsers` → `defaultAdminUsersClient`), and the create flow writes
 *   to the SAME table (`createAdminUser`). The two sources are already aligned.
 *   The defect was that the deployed `admin_users` table was never seeded: the
 *   bootstrap workflow referenced this script, but it did not exist, so the
 *   "bootstrapped super_admin" was never persisted to `admin_users` (it lived
 *   only as the synthetic "inject current admin when empty" safety-net row on
 *   the Users page). This script closes that gap by writing the super_admin
 *   DIRECTLY to `admin_users` through the service-role client, so the account
 *   appears in the list, is manageable/deletable, and can log in.
 *
 * Idempotent by email:
 *   - inserts a new ACTIVE super_admin when none exists, otherwise
 *   - re-activates and re-elevates the existing row to super_admin and refreshes
 *     its password to the provided break-glass credential (the whole point of a
 *     manually triggered break-glass bootstrap is to restore access).
 *
 * Usage:
 *   ADMIN_BOOTSTRAP_EMAIL=... ADMIN_BOOTSTRAP_PASSWORD=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx tsx scripts/bootstrap-admin.ts
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hashPassword } from "../lib/password";

export interface BootstrapAdminParams {
  email: string;
  password: string;
  /** Optional display name; defaults to the email local-part. */
  name?: string;
}

export interface BootstrapAdminResult {
  id: string;
  email: string;
  role: string;
  /** true when a new row was inserted; false when an existing row was updated. */
  created: boolean;
}

/**
 * Persist the bootstrap super_admin into `admin_users`. Idempotent by email.
 *
 * `admin_users` is a GLOBAL table (no `site_id`), so every query opts out of
 * tenant scoping — mirroring the DAL's privileged-client access pattern. The
 * caller is responsible for providing a service-role client (the only role
 * the `admin_users_service_all` RLS policy permits).
 */
export async function bootstrapAdmin(
  sb: SupabaseClient,
  params: BootstrapAdminParams,
): Promise<BootstrapAdminResult> {
  const email = params.email.trim().toLowerCase();
  if (!email) throw new Error("ADMIN_BOOTSTRAP_EMAIL is required");
  if (!params.password) throw new Error("ADMIN_BOOTSTRAP_PASSWORD is required");

  const name = params.name?.trim() || email.split("@")[0] || "Super Admin";
  const password_hash = await hashPassword(params.password);

  // Look up an existing account first so re-runs are safe and never create a
  // duplicate (email is UNIQUE on `admin_users`).
  const { data: existing, error: selErr } = await sb
    .from("admin_users")
    .select("id, email, role, is_active")
    .eq("email", email)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { data, error } = await sb
      .from("admin_users")
      .update({ role: "super_admin", is_active: true, password_hash })
      .eq("id", existing.id)
      .select("id, email, role")
      .single();
    if (error) throw error;
    return { id: data.id, email: data.email, role: data.role, created: false };
  }

  const { data, error } = await sb
    .from("admin_users")
    .insert({ email, password_hash, name, role: "super_admin", is_active: true })
    .select("id, email, role")
    .single();
  if (error) throw error;
  return { id: data.id, email: data.email, role: data.role, created: true };
}

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!supabaseUrl || !serviceKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  if (!email || !password) {
    console.error("Missing ADMIN_BOOTSTRAP_EMAIL or ADMIN_BOOTSTRAP_PASSWORD");
    process.exit(1);
  }

  const sb = createClient(supabaseUrl.trim().replace(/\/$/, ""), serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const result = await bootstrapAdmin(sb, { email, password });
    console.log(
      `✅  Bootstrapped super_admin in admin_users: ${result.email} (${result.id}) — ${
        result.created ? "created" : "updated"
      }`,
    );
  } catch (err) {
    console.error("Bootstrap failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// Only auto-run when invoked directly (e.g. `tsx scripts/bootstrap-admin.ts`),
// not when imported by tests.
if (process.argv[1]?.includes("bootstrap-admin")) {
  void main();
}
