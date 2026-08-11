import { automationError } from "@/lib/automation/envelope";
import {
  classifyIdempotency,
  isValidIdempotencyKey,
  payloadHash,
} from "@/lib/automation/idempotency";
import { evaluatePolicy, type ActionType } from "@/lib/automation/policy";
import { getPolicyForAction } from "@/lib/dal/automation-policies";
import {
  createAutomationAction,
  getActionByIdempotencyKey,
  updateAutomationAction,
  type AutomationActionRow,
} from "@/lib/dal/automation-actions";
import { countActionsSince } from "@/lib/dal/automation-runs";
import type { AutomationAuthContext } from "@/lib/automation/auth";
import type { NextRequest, NextResponse } from "next/server";

export interface GuardedMutationExecution<TResult> {
  result: TResult;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
  targetId?: string | null;
}

export interface GuardedMutationError {
  code:
    | "AUTOMATION_NOT_FOUND"
    | "AUTOMATION_VALIDATION_ERROR"
    | "AUTOMATION_SLUG_CONFLICT"
    | "AUTOMATION_INTERNAL_ERROR";
  message: string;
}

export interface GuardedMutationOptions<TResult> {
  request: NextRequest;
  requestId: string;
  auth: AutomationAuthContext;
  actionType: ActionType;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  runId?: string | null;
  runActionCount?: number;
  replay: (action: AutomationActionRow) => NextResponse;
  success: (
    execution: GuardedMutationExecution<TResult>,
    action: AutomationActionRow,
  ) => NextResponse;
  execute: (action: AutomationActionRow) => Promise<GuardedMutationExecution<TResult>>;
  validateTarget?: () => Promise<void>;
  mapError?: (error: unknown) => GuardedMutationError;
}

function defaultMapError(error: unknown): GuardedMutationError {
  return {
    code: "AUTOMATION_INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "Mutation failed",
  };
}

/** Run the common idempotency, policy, action-record, execution pipeline. */
export async function runGuardedMutation<TResult>(
  options: GuardedMutationOptions<TResult>,
): Promise<NextResponse> {
  const { request, requestId, auth, actionType, targetType, targetId, payload } = options;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";

  if (!idempotencyKey) {
    return automationError(
      "AUTOMATION_BAD_REQUEST",
      "Idempotency-Key header is required for mutations",
      requestId,
    );
  }
  if (!isValidIdempotencyKey(idempotencyKey)) {
    return automationError("AUTOMATION_BAD_REQUEST", "Malformed Idempotency-Key", requestId);
  }

  const hash = await payloadHash(payload);
  const existing = await getActionByIdempotencyKey(auth.account.id, idempotencyKey);
  const outcome = classifyIdempotency(existing, hash);
  if (outcome.kind === "conflict") {
    return automationError(
      "AUTOMATION_IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was already used with a different payload",
      requestId,
      { meta: { action_id: existing!.id } },
    );
  }
  if (outcome.kind === "replay") return options.replay(outcome.existing);

  if (options.validateTarget) {
    try {
      await options.validateTarget();
    } catch (error) {
      const mapped = (options.mapError ?? defaultMapError)(error);
      return automationError(mapped.code, mapped.message, requestId);
    }
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const [override, dayCount] = await Promise.all([
    getPolicyForAction(auth.siteId, actionType),
    countActionsSince(auth.account.id, startOfDay.toISOString()),
  ]);
  const decision = evaluatePolicy({
    actionType,
    override: override
      ? { mode: override.mode, constraints: override.constraints, is_active: override.is_active }
      : null,
    itemCount: 1,
    runActionCount: options.runActionCount,
    dayActionCount: dayCount,
    maxActionsPerDay: auth.account.max_actions_per_day,
    maxActionsPerRun: auth.account.max_actions_per_run,
  });
  const baseAction = {
    run_id: options.runId ?? null,
    service_account_id: auth.account.id,
    site_id: auth.siteId,
    idempotency_key: idempotencyKey,
    action_type: actionType,
    target_type: targetType,
    target_id: targetId,
    payload,
    payload_hash: hash,
  } as const;

  if (decision.decision === "deny") {
    await createAutomationAction({
      ...baseAction,
      risk_level: decision.risk,
      policy_decision: "deny",
      status: "failed",
    });
    return automationError("AUTOMATION_POLICY_DENIED", decision.reasons.join("; "), requestId);
  }

  if (decision.decision === "approval_required") {
    const action = await createAutomationAction({
      ...baseAction,
      risk_level: decision.risk,
      policy_decision: "approval_required",
      status: "manual_attention",
    });
    return automationError(
      "AUTOMATION_POLICY_APPROVAL_REQUIRED",
      decision.reasons.join("; "),
      requestId,
      { meta: { action_id: action.id }, details: { action_id: action.id } },
    );
  }

  const action = await createAutomationAction({
    ...baseAction,
    risk_level: decision.risk,
    policy_decision: "allow",
    status: "running",
  });

  try {
    const execution = await options.execute(action);
    await updateAutomationAction(auth.siteId, action.id, {
      status: "succeeded",
      target_id: execution.targetId ?? targetId,
      before_snapshot: execution.beforeSnapshot ?? null,
      after_snapshot: execution.afterSnapshot ?? null,
      result: execution.result as Record<string, unknown>,
    });
    return options.success(execution, action);
  } catch (error) {
    const mapped = (options.mapError ?? defaultMapError)(error);
    await updateAutomationAction(auth.siteId, action.id, {
      status: "failed",
      error_code: mapped.code,
      error_message: mapped.message.slice(0, 500),
    });
    return automationError(mapped.code, mapped.message, requestId, {
      meta: { action_id: action.id },
    });
  }
}
