// Automation policies — per-site, per-action override of the default policy
// matrix. Site-scoped; RLS service_role-only (migration 2026071505).
import { assertRow, rowOrNull, untypedFrom } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
import { getAutomationDbClient } from "@/lib/automation/db";
import type { PolicyMode } from "@/lib/automation/policy";

const TABLE = "automation_policies";
const ALL_COLUMNS =
  "id, site_id, action_type, mode, constraints, is_active, updated_by, updated_at" as const;

export interface AutomationPolicyRow {
  id: string;
  site_id: string;
  action_type: string;
  mode: PolicyMode;
  constraints: Record<string, unknown>;
  is_active: boolean;
  updated_by: string;
  updated_at: string;
}

export async function getPolicyForAction(
  siteId: string,
  actionType: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationPolicyRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("site_id", siteId)
    .eq("action_type", actionType)
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationPolicyRow>(data);
}

export async function listPoliciesForSite(
  siteId: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationPolicyRow[]> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("site_id", siteId)
    .order("action_type", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AutomationPolicyRow[];
}

type AutomationPolicyInsert = Omit<AutomationPolicyRow, "id" | "updated_at">;

/**
 * Upsert a per-site automation policy keyed by (site_id, action_type).
 * Returns the row with any server-default timestamps / IDs populated.
 */
export async function upsertAutomationPolicy(
  input: AutomationPolicyInsert,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationPolicyRow> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .upsert(input, { onConflict: "site_id, action_type", ignoreDuplicates: false })
    .select(ALL_COLUMNS)
    .single();

  if (error) throw error;
  return assertRow<AutomationPolicyRow>(data, "AutomationPolicy");
}
