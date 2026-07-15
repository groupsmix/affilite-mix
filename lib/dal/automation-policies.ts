// Automation policies — per-site, per-action override of the default policy
// matrix. Site-scoped; RLS service_role-only (migration 2026071505).
import { rowOrNull, untypedFrom } from "./type-guards";
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

export async function upsertPolicyForAction(
  values: {
    site_id: string;
    action_type: string;
    mode: PolicyMode;
    constraints: Record<string, unknown>;
    is_active: boolean;
    updated_by: string;
  },
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationPolicyRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .upsert(
      {
        site_id: values.site_id,
        action_type: values.action_type,
        mode: values.mode,
        constraints: values.constraints,
        is_active: values.is_active,
        updated_by: values.updated_by,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "site_id,action_type" },
    )
    .select(ALL_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationPolicyRow>(data);
}
