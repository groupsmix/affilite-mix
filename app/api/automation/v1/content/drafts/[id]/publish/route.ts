import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { parseJsonBody } from "@/lib/api-error";
import { publishDraft } from "@/lib/automation/publish-draft";
import { parsePublishDraftInput } from "@/lib/automation/schemas";
import { runGuardedMutation } from "@/lib/automation/guarded-mutation";
import type { ActionType } from "@/lib/automation/policy";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTION_TYPE: ActionType = "content.publish";

async function draftIdFromRequest(
  request: NextRequest,
  params?: Promise<Record<string, string | string[] | undefined>>,
): Promise<string | null> {
  const resolved = await params;
  const raw = resolved?.id;
  const idFromParams = Array.isArray(raw) ? raw[0] : raw;
  if (idFromParams && UUID_RE.test(idFromParams)) {
    return idFromParams;
  }

  // Fallback: parse the raw URL path. Some edge runtimes do not reliably
  // populate context.params for deeply-nested route handlers.
  const url = new URL(request.url);
  const match = url.pathname.match(
    /\/drafts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/publish(?:\/|$)/i,
  );
  return match?.[1] ?? null;
}

// POST /api/automation/v1/content/drafts/:id/publish
// Promote an AI draft to live content. Supports optional overrides for
// title/slug/excerpt/body/content_type/meta before publishing. Resolves slug
// collisions by appending a numeric suffix. Requires content:publish.
export const POST = withAutomation(
  ["content:publish"],
  async (request: NextRequest, { auth, requestId, params }) => {
    const { siteId, account } = auth;

    const id = await draftIdFromRequest(request, params);
    if (!id) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid draft id", requestId);
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

    return runGuardedMutation({
      request,
      requestId,
      auth,
      actionType: ACTION_TYPE,
      targetType: "ai_draft",
      targetId: id,
      payload: { draft_id: id, ...input },
      replay: (prior) =>
        automationSuccess(
          {
            content_id: (prior.result?.content_id as string) ?? null,
            draft_id: (prior.result?.draft_id as string) ?? null,
          },
          requestId,
          { meta: { action_id: prior.id } },
        ),
      execute: async () => {
        const { content, draft } = await publishDraft(siteId, id, account.id, input);
        return {
          result: { content_id: content.id, draft_id: draft.id },
          afterSnapshot: { content_id: content.id, draft_id: draft.id, status: draft.status },
          targetId: draft.id,
        };
      },
      success: (execution, action) =>
        automationSuccess(execution.result, requestId, {
          status: 201,
          meta: { action_id: action.id },
        }),
      mapError: (err) => {
        const status = (err as Error & { status?: number }).status;
        let errorCode = "AUTOMATION_INTERNAL_ERROR" as
          | "AUTOMATION_NOT_FOUND"
          | "AUTOMATION_VALIDATION_ERROR"
          | "AUTOMATION_SLUG_CONFLICT"
          | "AUTOMATION_INTERNAL_ERROR";
        if (status === 404) errorCode = "AUTOMATION_NOT_FOUND";
        if (status === 422) errorCode = "AUTOMATION_VALIDATION_ERROR";
        if (status === 409 || (err instanceof Error && err.message.includes("slug conflict"))) {
          errorCode = "AUTOMATION_SLUG_CONFLICT";
        }
        return {
          code: errorCode,
          message: err instanceof Error ? err.message : "Failed to publish draft",
        };
      },
    });
  },
);
