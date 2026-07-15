// Automation bearer tokens — only the SHA-256 hash is stored; the plaintext
// is shown once at creation. The table is service_role-only (migration
// 2026071505) and has no site_id column (the site binding lives on the
// linked service account), so reads/writes use the explicit cross-tenant
// opt-out. Mirrors lib/dal/admin-api-tokens.ts.
import { assertRow, rowOrNull, untypedFrom } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
import { getAutomationDbClient } from "@/lib/automation/db";

const TABLE = "automation_tokens";
const ALL_COLUMNS =
  "id, service_account_id, token_hash, name, expires_at, last_used_at, revoked_at, created_by, created_at" as const;

export interface AutomationTokenRow {
  id: string;
  service_account_id: string;
  token_hash: string;
  name: string;
  expires_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string;
  created_at: string;
}

export type NewAutomationToken = Omit<
  AutomationTokenRow,
  "id" | "created_at" | "last_used_at" | "revoked_at"
>;

export async function createAutomationToken(
  values: NewAutomationToken,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationTokenRow> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .insert({
      service_account_id: values.service_account_id,
      token_hash: values.token_hash,
      name: values.name,
      expires_at: values.expires_at,
      created_by: values.created_by,
    })
    .select(ALL_COLUMNS)
    // SAFE: automation_tokens has no site_id; the binding lives on the linked service account. token_hash is globally unique.
    .unsafeNoSiteFilter()
    .single();
  if (error) throw error;
  return assertRow<AutomationTokenRow>(data, TABLE);
}

export async function getAutomationTokenByHash(
  tokenHash: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationTokenRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("token_hash", tokenHash)
    // SAFE: token_hash is globally unique; lookup is for authentication.
    .unsafeNoSiteFilter()
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationTokenRow>(data);
}

export async function touchAutomationToken(
  id: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<void> {
  const sb = await getClient();
  const { error } = await untypedFrom(sb, TABLE)
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", id)
    // SAFE: single row by primary key; no site_id column exists.
    .unsafeNoSiteFilter();
  if (error) throw error;
}

export async function revokeAutomationToken(
  id: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<void> {
  const sb = await getClient();
  const { error } = await untypedFrom(sb, TABLE)
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    // SAFE: single row by primary key; no site_id column exists.
    .unsafeNoSiteFilter();
  if (error) throw error;
}

/** A token is usable when it is unrevoked and unexpired. */
export function isAutomationTokenUsable(
  token: AutomationTokenRow | null,
): token is AutomationTokenRow {
  if (!token) return false;
  if (token.revoked_at) return false;
  if (new Date(token.expires_at) <= new Date()) return false;
  return true;
}
