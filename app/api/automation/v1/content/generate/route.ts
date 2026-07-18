import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { parseJsonBody } from "@/lib/api-error";
import { getAutomationDbClient } from "@/lib/automation/db";
import { parseGenerateContentInput } from "@/lib/automation/schemas";
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
import { countActionsSince } from "@/lib/dal/automation-runs";
import { createAIDraft } from "@/lib/dal/ai-drafts";
import { generateContent } from "@/lib/ai/content-generator";
import { getAvailableProviders } from "@/lib/ai/providers";
import { getSiteById } from "@/config/sites";
import { recordAuditEvent } from "@/lib/audit-log";

const ACTION_TYPE = "content.draft.generate";
// Share policy settings with manual draft creation so operators can cap total
// AI draft generation in one place.
const POLICY_ACTION_TYPE = "content.draft.create";

// POST /api/automation/v1/content/generate
// Generate a new AI draft from a topic/keywords. The draft lands in the same
// pending review workflow as the dashboard AI Generator. Publishing still needs
// a separate call to /content/drafts/:id/publish.
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

    const validated = parseGenerateContentInput(parsedBody as Record<string, unknown>);
    if (!validated.ok) {
      return automationError(
        "AUTOMATION_VALIDATION_ERROR",
        "Generate request failed validation",
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
        { draft_id: prior.after_snapshot?.draft_id ?? null, replayed: true, status: prior.status },
        requestId,
        { meta: { action_id: prior.id } },
      );
    }

    // ── Policy ────────────────────────────────────────────────────
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [override, dayCount] = await Promise.all([
      getPolicyForAction(siteId, POLICY_ACTION_TYPE),
      countActionsSince(account.id, startOfDay.toISOString()),
    ]);

    const decision = evaluatePolicy({
      actionType: POLICY_ACTION_TYPE,
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
        run_id: null,
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
      run_id: null,
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
      const site = getSiteById(siteId);

      const availableProviders = getAvailableProviders();
      if (availableProviders.length === 0) {
        await updateAutomationAction(siteId, action.id, {
          status: "failed",
          error_code: "AUTOMATION_AI_NOT_CONFIGURED",
          error_message: "No AI provider keys configured for this site",
        });
        return automationError(
          "AUTOMATION_AI_NOT_CONFIGURED",
          "No AI provider keys configured for this site",
          requestId,
          { meta: { action_id: action.id } },
        );
      }

      const result = await generateContent({
        siteId,
        siteName: site?.name ?? siteId,
        niche: site?.brand.niche ?? "",
        contentType: input.content_type,
        topic: input.topic,
        keywords: input.keywords,
        language: site?.language,
      });

      const draft = await createAIDraft(
        {
          site_id: siteId,
          title: result.title,
          slug: result.slug,
          body: result.body,
          excerpt: result.excerpt,
          content_type: result.contentType,
          topic: input.topic,
          keywords: input.keywords,
          ai_provider: result.provider,
          ai_model: result.model,
          status: "pending",
          generated_at: new Date().toISOString(),
          meta_title: result.metaTitle,
          meta_description: result.metaDescription,
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
        action: "automation.content.generate",
        entity_type: "ai_draft",
        entity_id: draft.id,
        details: {
          topic: input.topic,
          contentType: input.content_type,
          provider: result.provider,
          model: result.model,
        },
      });

      return automationSuccess(
        { draft_id: draft.id, status: draft.status, replayed: false },
        requestId,
        { status: 201, meta: { action_id: action.id } },
      );
    } catch (err) {
      await updateAutomationAction(siteId, action.id, {
        status: "failed",
        error_code: "CONTENT_GENERATE_FAILED",
        error_message: err instanceof Error ? err.message.slice(0, 500) : "unknown error",
      });
      return automationError("AUTOMATION_INTERNAL_ERROR", "Failed to generate content", requestId, {
        meta: { action_id: action.id },
      });
    }
  },
);
