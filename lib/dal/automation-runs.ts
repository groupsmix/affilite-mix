// Automation runs — a unit of agent work. Site-scoped; RLS service_role-only
// (migration 2026071505). The site_id is derived from the authenticated
// service account, never from request input.
import { assertRow, rowOrNull, untypedFrom } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
import { getAutomationDbClient } from "@/lib/automation/db";

const TABLE = "automation_runs";
const ALL_COLUMNS =
  "id, service_account_id, site_id, trigger, goal, status, planned_actions, succeeded_actions, failed_actions, manual_actions, started_at, finished_at, summary, error_code" as const;

export type RunTrigger = "scheduled" | "webhook" | "owner" | "recovery" | "agent";
export type RunStatus = "running" | "succeeded" | "partial" | "failed" | "cancelled";

export interface AutomationRunRow {
  id: string;
  service_account_id: string;
  site_id: string;
  trigger: RunTrigger;
  goal: string | null;
  status: RunStatus;
  planned_actions: number;
  succeeded_actions: number;
  failed_actions: number;
  manual_actions: number;
  started_at: string;
  finished_at: string | null;
  summary: Record<string, unknown> | null;
  error_code: string | null;
}

export async function createAutomationRun(
  values: {
    service_account_id: string;
    site_id: string;
    trigger: RunTrigger;
    goal?: string | null;
  },
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationRunRow> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .insert({
      service_account_id: values.service_account_id,
      site_id: values.site_id,
      trigger: values.trigger,
      goal: values.goal ?? null,
      status: "running",
    })
    .select(ALL_COLUMNS)
    .single();
  if (error) throw error;
  return assertRow<AutomationRunRow>(data, TABLE);
}

export async function getAutomationRunById(
  siteId: string,
  id: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationRunRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("site_id", siteId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationRunRow>(data);
}

/** Count actions this account has created since the given ISO timestamp. */
export async function countActionsSince(
  serviceAccountId: string,
  sinceIso: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<number> {
  const sb = await getClient();
  const { count, error } = await untypedFrom(sb, "automation_actions")
    .select("id", { count: "exact", head: true })
    .eq("service_account_id", serviceAccountId)
    .gte("created_at", sinceIso)
    // SAFE: quota aggregate scoped by service_account_id, which is itself site-bound; counts only the account's own actions.
    .unsafeNoSiteFilter();
  if (error) throw error;
  return count ?? 0;
}
