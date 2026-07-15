// Automation service accounts are global control-plane rows (a machine
// identity bound to exactly one site). RLS restricts the table to
// service_role (migration 2026071505); the automation gateway reaches it
// through the privileged client after authenticating a bearer token. The
// site binding is read FROM the row, never from request input — mirroring
// lib/dal/admin-api-tokens.ts.
import { assertRow, rowOrNull, untypedFrom } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
import { getAutomationDbClient } from "@/lib/automation/db";

const TABLE = "automation_service_accounts";
const ALL_COLUMNS =
  "id, site_id, name, status, scopes, allowed_ip_ranges, max_actions_per_run, max_actions_per_day, created_by, created_at, updated_at" as const;

export interface AutomationServiceAccountRow {
  id: string;
  site_id: string;
  name: string;
  status: "active" | "suspended" | "revoked";
  scopes: string[];
  allowed_ip_ranges: string[] | null;
  max_actions_per_run: number;
  max_actions_per_day: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type NewAutomationServiceAccount = Omit<
  AutomationServiceAccountRow,
  "id" | "created_at" | "updated_at"
>;

export async function createAutomationServiceAccount(
  values: NewAutomationServiceAccount,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationServiceAccountRow> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    // The insert payload carries a non-empty `site_id`, satisfying the
    // privileged-client site-filter guard.
    .insert({
      site_id: values.site_id,
      name: values.name,
      status: values.status,
      scopes: values.scopes,
      allowed_ip_ranges: values.allowed_ip_ranges,
      max_actions_per_run: values.max_actions_per_run,
      max_actions_per_day: values.max_actions_per_day,
      created_by: values.created_by,
    })
    .select(ALL_COLUMNS)
    .single();
  if (error) throw error;
  return assertRow<AutomationServiceAccountRow>(data, TABLE);
}

export async function getAutomationServiceAccountById(
  id: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationServiceAccountRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("id", id)
    // SAFE: fetched by primary key; the site binding is derived from the row.
    .unsafeNoSiteFilter()
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationServiceAccountRow>(data);
}

export async function listAutomationServiceAccountsForSite(
  siteId: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationServiceAccountRow[]> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AutomationServiceAccountRow[];
}

export async function setAutomationServiceAccountStatus(
  id: string,
  status: AutomationServiceAccountRow["status"],
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationServiceAccountRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    // SAFE: single row by primary key; the account is itself site-bound.
    .unsafeNoSiteFilter()
    .select(ALL_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationServiceAccountRow>(data);
}

/** True when the account may currently authenticate (active status). */
export function isServiceAccountActive(
  account: AutomationServiceAccountRow | null,
): account is AutomationServiceAccountRow {
  return !!account && account.status === "active";
}
