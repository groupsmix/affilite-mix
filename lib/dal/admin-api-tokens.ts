// Admin API tokens are global, cross-tenant objects. RLS is enabled on
// the table, but the DAL needs to create/read/revoke tokens regardless of
// the current active site, so the privileged client is used. The public API
// is gated at the route layer: token creation requires super_admin, token
// exchange requires a valid token hash and sets the resulting session.
// This module is on the SERVICE_ROLE_IMPORT_ALLOWLIST.
import { assertRow, rowOrNull } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
// nosemgrep: service-role-import
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";

const TABLE = "admin_api_tokens";
const ALL_COLUMNS =
  "id, site_id, token_hash, name, created_by, last_used_at, expires_at, is_active, created_at, updated_at" as const;

export interface AdminApiTokenRow {
  id: string;
  site_id: string | null;
  token_hash: string;
  name: string;
  created_by: string;
  last_used_at: string | null;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type AdminApiTokenPublic = Omit<AdminApiTokenRow, "token_hash">;

const defaultClient: DalClientGetter = () => getPrivilegedSupabaseClient("admin-api-tokens");

function now(): string {
  return new Date().toISOString();
}

export async function createAdminApiToken(
  values: Omit<AdminApiTokenRow, "id" | "created_at" | "updated_at" | "last_used_at">,
  getClient: DalClientGetter = defaultClient,
): Promise<AdminApiTokenRow> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .insert({
      site_id: values.site_id,
      token_hash: values.token_hash,
      name: values.name,
      created_by: values.created_by,
      expires_at: values.expires_at,
      is_active: values.is_active,
    })
    .select(ALL_COLUMNS)
    // SAFE: admin_api_tokens is a global, cross-tenant table; the token_hash is unique.
    .unsafeNoSiteFilter()
    .single();
  if (error) throw error;
  return assertRow<AdminApiTokenRow>(data, TABLE);
}

export async function getAdminApiTokenByHash(
  tokenHash: string,
  getClient: DalClientGetter = defaultClient,
): Promise<AdminApiTokenRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(ALL_COLUMNS)
    .eq("token_hash", tokenHash)
    // SAFE: admin_api_tokens is a global table; token_hash is unique and the lookup is for exchange.
    .unsafeNoSiteFilter()
    .single();
  if (error) return null;
  return rowOrNull<AdminApiTokenRow>(data);
}

export async function listAdminApiTokens(
  getClient: DalClientGetter = defaultClient,
): Promise<AdminApiTokenPublic[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(
      "id, site_id, name, created_by, last_used_at, expires_at, is_active, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    // SAFE: admin_api_tokens is a global, cross-tenant table; tokens are listed for all sites.
    .unsafeNoSiteFilter();
  if (error) throw error;
  return (data ?? []) as AdminApiTokenPublic[];
}

export async function deleteAdminApiToken(
  id: string,
  getClient: DalClientGetter = defaultClient,
): Promise<void> {
  const sb = await getClient();
  // SAFE: admin_api_tokens is a global table; the revocation is by unique id, not site.
  const { error } = await sb.from(TABLE).delete().eq("id", id).unsafeNoSiteFilter();
  if (error) throw error;
}

export async function touchAdminApiToken(
  id: string,
  getClient: DalClientGetter = defaultClient,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb
    .from(TABLE)
    .update({ last_used_at: now() })
    .eq("id", id)
    // SAFE: admin_api_tokens is a global table; touch updates a single row by id.
    .unsafeNoSiteFilter();
  if (error) throw error;
}

export async function isAdminApiTokenValid(token: AdminApiTokenRow | null): Promise<boolean> {
  if (!token) return false;
  if (!token.is_active) return false;
  if (new Date(token.expires_at) <= new Date()) return false;
  return true;
}
