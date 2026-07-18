import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { parseJsonBody } from "@/lib/api-error";
import { getAutomationDbClient } from "@/lib/automation/db";
import { parseDraftInput } from "@/lib/automation/schemas";
import {
  payloadHash,
  classifyIdempotency,
  isValidIdempotencyKey,
} from "@/lib/automation/idempotency";
import { evaluatePolicy } from "@/lib/automation/policy";
import { getPolicyForAction } from "@/lib/dal/automation-policies";
import {
  getActionByIdempotencyKey,
  createAutomationAction,
  updateAutomationAction,
} from "@/lib/dal/automation-actions";
import { getAutomationRunById, countActionsSince } from "@/lib/dal/automation-runs";
import { createAIDraft, listAIDrafts } from "@/lib/dal/ai-drafts";
import { recordAuditEvent } from "@/lib/audit-log";

function clampLimit(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n <= 0) return 25;
  return Math.min(n, 100);
}

const ACTION_TYPE = "content.draft.create";

// GET /api/automation/v1/content/drafts
// List AI drafts for the bound site. Supports status/type filters and
// keyset pagination via ?cursor. Returns summary fields only; use the
// individual /content/drafts/:id endpoint for the full body.
export const GET = withAutomation(
  ["content:read"],
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId } = auth;
    const params = request.nextUrl.searchParams;

    const statusParam = params.get("status");
    const status =
      statusParam && ["pending", "approved", "rejected", "published"].includes(statusParam)
        ? (statusParam as "pending" | "approved" | "rejected" | "published")
        : undefined;

    const rows = await listAIDrafts(
      {
        siteId,
        status,
        contentType: params.get("type") ?? undefined,
        q: params.get("q") ?? undefined,
        limit: clampLimit(params.get("limit")),
        cursor: params.get("cursor") ?? undefined,
      },
      getAutomationDbClient,
    );

    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      content_type: r.content_type,
      topic: r.topic,
      keywords: r.keywords,
      status: r.status,
      ai_provider: r.ai_provider,
      ai_model: r.ai_model,
      generated_at: r.generated_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const nextCursor = rows.length > 0 ? rows[rows.length - 1]!.created_at : null;

    return automationSuccess({ items, next_cursor: nextCursor }, requestId);
  },
);

// POST /api/automation/v1/content/drafts
// Idempotent creation of an AI draft. The draft enters the SAME pending
// review workflow humans use (status "pending"): publishing stays
// approval-gated. Reusing an Idempotency-Key with the same payload replays
// the original result; a different payload is a 409 conflict.
export const POST = withAutomation(
  ["content:draft"],
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId, account } = auth;

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

    const validated = parseDraftInput(parsedBody as Record<string, unknown>);
    if (!validated.ok) {
      return automationError("AUTOMATION_VALIDATION_ERROR", "Draft failed validation", requestId, {
        details: { errors: validated.errors.join("; ") },
      });
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
        { draft_id: prior.after_snapshot?.draft_id ?? null, replayed: true, status: prior.status },
        requestId,
        { meta: { action_id: prior.id } },
      );
    }

    // ── Optional run linkage ──────────────────────────────────────
    let runId: string | null = null;
    if (input.run_id) {
      const run = await getAutomationRunById(siteId, input.run_id);
      if (!run) {
        return automationError("AUTOMATION_NOT_FOUND", "run_id not found for this site", requestId);
      }
      runId = run.id;
    }

    // ── Policy ────────────────────────────────────────────────────
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
      // Record the denied attempt for the audit trail before rejecting.
      await createAutomationAction({
        run_id: runId,
        service_account_id: account.id,
        site_id: siteId,
        idempotency_key: idempotencyKey,
        action_type: ACTION_TYPE,
        target_type: "ai_draft",
        risk_level: decision.risk,
        policy_decision: "deny",
        status: "failed",
        payload: { ...input },
        payload_hash: hash,
      });
      return automationError("AUTOMATION_POLICY_DENIED", decision.reasons.join("; "), requestId);
    }

    if (decision.decision === "approval_required") {
      const action = await createAutomationAction({
        run_id: runId,
        service_account_id: account.id,
        site_id: siteId,
        idempotency_key: idempotencyKey,
        action_type: ACTION_TYPE,
        target_type: "ai_draft",
        risk_level: decision.risk,
        policy_decision: "approval_required",
        status: "manual_attention",
        payload: { ...input },
        payload_hash: hash,
      });
      return automationError(
        "AUTOMATION_POLICY_APPROVAL_REQUIRED",
        decision.reasons.join("; "),
        requestId,
        { meta: { action_id: action.id }, details: { action_id: action.id } },
      );
    }

    // ── Execute (allow) ───────────────────────────────────────────
    const action = await createAutomationAction({
      run_id: runId,
      service_account_id: account.id,
      site_id: siteId,
      idempotency_key: idempotencyKey,
      action_type: ACTION_TYPE,
      target_type: "ai_draft",
      risk_level: decision.risk,
      policy_decision: "allow",
      status: "running",
      payload: { ...input },
      payload_hash: hash,
    });

    try {
      const draft = await createAIDraft(
        {
          site_id: siteId,
          title: input.title,
          slug: input.slug,
          body: input.body,
          excerpt: input.excerpt,
          content_type: input.content_type,
          topic: input.topic,
          keywords: input.keywords,
          ai_provider: input.ai_provider,
          ai_model: input.ai_model,
          status: "pending",
          generated_at: new Date().toISOString(),
          meta_title: input.meta_title,
          meta_description: input.meta_description,
        },
        getAutomationDbClient,
      );

      await updateAutomationAction(siteId, action.id, {
        status: "succeeded",
        target_id: draft.id,
        after_snapshot: { draft_id: draft.id, status: draft.status },
        result: { draft_id: draft.id },
      });

      await recordAuditEvent({
        site_id: siteId,
        actor: `agent:${account.id}`,
        action: "automation.content.draft.create",
        entity_type: "ai_draft",
        entity_id: draft.id,
        details: { title: draft.title, slug: draft.slug, status: draft.status },
      });

      return automationSuccess(
        { draft_id: draft.id, status: draft.status, replayed: false },
        requestId,
        { status: 201, meta: { action_id: action.id, ...(runId ? { run_id: runId } : {}) } },
      );
    } catch (err) {
      await updateAutomationAction(siteId, action.id, {
        status: "failed",
        error_code: "DRAFT_CREATE_FAILED",
        error_message: err instanceof Error ? err.message.slice(0, 500) : "unknown error",
      });
      return automationError(
        "AUTOMATION_INTERNAL_ERROR",
        "Failed to persist the draft",
        requestId,
        { meta: { action_id: action.id } },
      );
    }
  },
);
