// Automation actions — durable, idempotent records of a single mutation.
// Site-scoped; RLS service_role-only (migration 2026071505). Sensitive
// values must never be stored in payload / snapshots / result / errors.
import { assertRow, rowOrNull, untypedFrom } from "./type-guards";
import { type DalClientGetter } from "./dal-client";
import { getAutomationDbClient } from "@/lib/automation/db";
import { assertTransition, type ActionState } from "@/lib/automation/action-state";
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

export async function hasRecentAutomationAction(
  siteId: string,
  productId: string,
  actionType: string,
  sinceIso: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<boolean> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select("id")
    .eq("site_id", siteId)
    .eq("target_id", productId)
    .eq("action_type", actionType)
    .gte("created_at", sinceIso)
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function hasPendingAutomationAction(
  siteId: string,
  productId: string,
  actionType: string,
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<boolean> {
  const sb = await getClient();
  const { data, error } = await untypedFrom(sb, TABLE)
    .select("id")
    .eq("site_id", siteId)
    .eq("target_id", productId)
    .eq("action_type", actionType)
    .eq("status", "manual_attention")
    .limit(1);
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function listAutomationActionsForSite(
  siteId: string,
  options: { status?: ActionState; limit?: number; offset?: number } = {},
  getClient: DalClientGetter = getAutomationDbClient,
): Promise<AutomationActionRow[]> {
  const sb = await getClient();
  const limit = Math.max(1, Math.min(options.limit ?? 50, 100));
  const offset = Math.max(0, Math.min(options.offset ?? 0, 100_000));
  let query = untypedFrom(sb, TABLE)
    .select(ALL_COLUMNS)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (options.status) query = query.eq("status", options.status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: unknown) => assertRow<AutomationActionRow>(row, TABLE));
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
  expectedStatus?: ActionState,
): Promise<AutomationActionRow | null> {
  if (patch.status) {
    const existing = await getAutomationActionById(siteId, id, getClient);
    if (!existing) return null;
    assertTransition(existing.status, patch.status);
  }
  const sb = await getClient();
  let updateQuery = untypedFrom(sb, TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("site_id", siteId)
    .eq("id", id);
  if (expectedStatus) updateQuery = updateQuery.eq("status", expectedStatus);
  const { data, error } = await updateQuery.select(ALL_COLUMNS).maybeSingle();
  if (error) throw error;
  if (!data && expectedStatus) {
    const current = await getAutomationActionById(siteId, id, getClient);
    if (current) {
      throw Object.assign(
        new Error(`Automation action changed before transition from ${expectedStatus}`),
        { status: 409, code: "AUTOMATION_ACTION_CONFLICT" },
      );
    }
  }
  return rowOrNull<AutomationActionRow>(data);
}
