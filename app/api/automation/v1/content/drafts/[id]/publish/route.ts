import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { parseJsonBody } from "@/lib/api-error";
import { publishDraft } from "@/lib/automation/publish-draft";
import { parsePublishDraftInput } from "@/lib/automation/schemas";
import {
  payloadHash,
  classifyIdempotency,
  isValidIdempotencyKey,
} from "@/lib/automation/idempotency";
import { evaluatePolicy, type ActionType } from "@/lib/automation/policy";
import { getPolicyForAction } from "@/lib/dal/automation-policies";
import {
  getActionByIdempotencyKey,
  createAutomationAction,
  updateAutomationAction,
} from "@/lib/dal/automation-actions";
import { countActionsSince } from "@/lib/dal/automation-runs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_TYPE: ActionType = "content.publish";

async function draftIdFromParams(
  params?: Promise<Record<string, string | string[] | undefined>>,
): Promise<string | null> {
  const resolved = await params;
  const raw = resolved?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  return id && UUID_RE.test(id) ? id : null;
}

// POST /api/automation/v1/content/drafts/:id/publish
// Promote an AI draft to live content. Supports optional overrides for
// title/slug/excerpt/body/content_type/meta before publishing. Resolves slug
// collisions by appending a numeric suffix. Requires content:publish.
export const POST = withAutomation(
  ["content:publish"],
  async (request: NextRequest, { auth, requestId, params }) => {
    const { siteId, account } = auth;

    const id = await draftIdFromParams(params);
    if (!id) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid draft id", requestId);
    }

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

    const parsedBody = await parseJsonBody(request);
    if (parsedBody instanceof Response) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid JSON body", requestId);
    }

    const validated = parsePublishDraftInput(parsedBody as Record<string, unknown>);
    if (!validated.ok) {
      return automationError(
        "AUTOMATION_VALIDATION_ERROR",
        "Publish request failed validation",
        requestId,
        { details: { errors: validated.errors.join("; ") } },
      );
    }
    const input = validated.value;

    const hash = await payloadHash(input);

    // ── Idempotency ──────────────────────────────────────────────
    const existing = await getActionByIdempotencyKey(account.id, idempotencyKey);
    const outcome = classifyIdempotency(existing, hash);
    if (outcome.kind === "conflict") {
      return automationError(
        "AUTOMATION_IDEMPOTENCY_CONFLICT",
        "Idempotency-Key was already used with a different payload",
        requestId,
        { meta: { action_id: existing!.id } },
      );
    }
    if (outcome.kind === "replay") {
      const prior = outcome.existing;
      return automationSuccess(
        {
          content_id: (prior.result?.content_id as string) ?? null,
          draft_id: (prior.result?.draft_id as string) ?? null,
        },
        requestId,
        { meta: { action_id: prior.id } },
      );
    }

    // ── Policy ─────────────────────────────────────────────────────
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [override, dayCount] = await Promise.all([
      getPolicyForAction(siteId, ACTION_TYPE),
      countActionsSince(account.id, startOfDay.toISOString()),
    ]);

    const decision = evaluatePolicy({
      actionType: ACTION_TYPE,
      override: override
        ? { mode: override.mode, constraints: override.constraints, is_active: override.is_active }
        : null,
      itemCount: 1,
      dayActionCount: dayCount,
      maxActionsPerDay: account.max_actions_per_day,
      maxActionsPerRun: account.max_actions_per_run,
    });

    if (decision.decision === "deny") {
      await createAutomationAction({
        run_id: null,
        service_account_id: account.id,
        site_id: siteId,
        idempotency_key: idempotencyKey,
        action_type: ACTION_TYPE,
        target_type: "ai_draft",
        target_id: id,
        risk_level: decision.risk,
        policy_decision: "deny",
        status: "failed",
        payload: { draft_id: id, ...input },
        payload_hash: hash,
      });
      return automationError("AUTOMATION_POLICY_DENIED", decision.reasons.join("; "), requestId);
    }

    if (decision.decision === "approval_required") {
      const action = await createAutomationAction({
        run_id: null,
        service_account_id: account.id,
        site_id: siteId,
        idempotency_key: idempotencyKey,
        action_type: ACTION_TYPE,
        target_type: "ai_draft",
        target_id: id,
        risk_level: decision.risk,
        policy_decision: "approval_required",
        status: "manual_attention",
        payload: { draft_id: id, ...input },
        payload_hash: hash,
      });
      return automationError(
        "AUTOMATION_POLICY_APPROVAL_REQUIRED",
        decision.reasons.join("; "),
        requestId,
        { meta: { action_id: action.id }, details: { action_id: action.id } },
      );
    }

    // ── Execute (allow) ────────────────────────────────────────────
    const action = await createAutomationAction({
      run_id: null,
      service_account_id: account.id,
      site_id: siteId,
      idempotency_key: idempotencyKey,
      action_type: ACTION_TYPE,
      target_type: "ai_draft",
      target_id: id,
      risk_level: decision.risk,
      policy_decision: "allow",
      status: "running",
      payload: { draft_id: id, ...input },
      payload_hash: hash,
    });

    try {
      const { content, draft } = await publishDraft(siteId, id, account.id, input);

      await updateAutomationAction(siteId, action.id, {
        status: "succeeded",
        target_id: draft.id,
        after_snapshot: { content_id: content.id, draft_id: draft.id, status: draft.status },
        result: { content_id: content.id, draft_id: draft.id },
      });

      return automationSuccess({ content_id: content.id, draft_id: draft.id }, requestId, {
        status: 201,
        meta: { action_id: action.id },
      });
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      let errorCode:
        | "AUTOMATION_NOT_FOUND"
        | "AUTOMATION_VALIDATION_ERROR"
        | "AUTOMATION_SLUG_CONFLICT"
        | "AUTOMATION_INTERNAL_ERROR" = "AUTOMATION_INTERNAL_ERROR";
      if (status === 404) errorCode = "AUTOMATION_NOT_FOUND";
      if (status === 422) errorCode = "AUTOMATION_VALIDATION_ERROR";
      if (status === 409 || (err instanceof Error && err.message.includes("slug conflict"))) {
        errorCode = "AUTOMATION_SLUG_CONFLICT";
      }

      await updateAutomationAction(siteId, action.id, {
        status: "failed",
        error_code: errorCode,
        error_message: err instanceof Error ? err.message.slice(0, 500) : "unknown error",
      });

      return automationError(
        errorCode,
        err instanceof Error ? err.message : "Failed to publish draft",
        requestId,
        { meta: { action_id: action.id } },
      );
    }
  },
);
