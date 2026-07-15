// Automation actions — durable, idempotent records of a single mutation.
// Site-scoped; RLS service_role-only (migration 2026071505). Sensitive
// values must never be stored in payload / snapshots / result / errors.
import { assertRow, rowOrNull, untypedFrom } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
import { getAutomationDbClient } from "@/lib/automation/db";
import type { ActionState } from "@/lib/automation/action-state";
import type { PolicyMode, RiskLevel } from "@/lib/automation/policy";

const TABLE = "automation_actions";
const ALL_COLUMNS =
  "id, run_id, service_account_id, site_id, idempotency_key, action_type, target_type, target_id, risk_level, policy_decision, status, payload, payload_hash, before_snapshot, after_snapshot, result, attempt_count, next_attempt_at, approved_by, approved_at, error_code, error_message, created_at, updated_at" as const;

export interface AutomationActionRow {
  id: string;
  run_id: string | null;
  service_account_id: string;
  site_id: string;
  idempotency_key: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  risk_level: RiskLevel;
  policy_decision: PolicyMode;
  status: ActionState;
  payload: Record<string, unknown>;
  payload_hash: string;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  attempt_count: number;
  next_attempt_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewAutomationAction {
  run_id: string | null;
  service_account_id: string;
  site_id: string;
  idempotency_key: string;
  action_type: string;
  target_type?: string | null;
  target_id?: string | null;
  risk_level: RiskLevel;
  policy_decision: PolicyMode;
  status: ActionState;
  payload: Record<string, unknown>;
  payload_hash: string;
}

export async function createAutomationAction(
  values: NewAutomationAction,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationActionRow> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .insert({
      run_id: values.run_id,
      service_account_id: values.service_account_id,
      site_id: values.site_id,
      idempotency_key: values.idempotency_key,
      action_type: values.action_type,
      target_type: values.target_type ?? null,
      target_id: values.target_id ?? null,
      risk_level: values.risk_level,
      policy_decision: values.policy_decision,
      status: values.status,
      payload: values.payload,
      payload_hash: values.payload_hash,
    })
    .select(ALL_COLUMNS)
    .single();
  if (error) throw error;
  return assertRow<AutomationActionRow>(data, TABLE);
}

export async function getActionByIdempotencyKey(
  serviceAccountId: string,
  idempotencyKey: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationActionRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("service_account_id", serviceAccountId)
    .eq("idempotency_key", idempotencyKey)
    // SAFE: unique (service_account_id, idempotency_key); the account is site-bound so this cannot cross tenants.
    .unsafeNoSiteFilter()
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationActionRow>(data);
}

export async function getAutomationActionById(
  siteId: string,
  id: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationActionRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("site_id", siteId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationActionRow>(data);
}

export async function updateAutomationAction(
  siteId: string,
  id: string,
  patch: Partial<
    Pick<
      AutomationActionRow,
      | "status"
      | "before_snapshot"
      | "after_snapshot"
      | "result"
      | "attempt_count"
      | "next_attempt_at"
      | "approved_by"
      | "approved_at"
      | "error_code"
      | "error_message"
      | "target_id"
    >
  >,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationActionRow | null> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("id", id)
    .select(ALL_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  return rowOrNull<AutomationActionRow>(data);
}
