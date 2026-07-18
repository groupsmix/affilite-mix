import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { hasScope } from "@/lib/automation/scopes";
import { parseJsonBody } from "@/lib/api-error";
import { getAutomationDbClient } from "@/lib/automation/db";
import { parseDraftUpdateInput } from "@/lib/automation/schemas";
import { publishDraft } from "@/lib/automation/publish-draft";
import { getAIDraft, updateAIDraft, deleteAIDraft } from "@/lib/dal/ai-drafts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Fallback: parse the raw URL path in case context.params is missing.
  const url = new URL(request.url);
  const match = url.pathname.match(
    /\/drafts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i,
  );
  return match?.[1] ?? null;
}

// GET /api/automation/v1/content/drafts/:id
// Fetch a single AI draft (tenant-isolated).
export const GET = withAutomation(
  ["content:read"],
  async (request: NextRequest, { auth, requestId, params }) => {
    const { siteId } = auth;
    const id = await draftIdFromRequest(request, params);
    if (!id) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid draft id", requestId);
    }

    const draft = await getAIDraft(siteId, id, getAutomationDbClient);
    if (!draft) {
      return automationError("AUTOMATION_NOT_FOUND", "Draft not found", requestId);
    }

    return automationSuccess({ draft }, requestId);
  },
);

// PATCH /api/automation/v1/content/drafts/:id
// Update an AI draft. Partial updates are allowed. Setting status to "published"
// promotes the draft to live content (requires content:publish in addition to
// content:draft) using the same logic as the dedicated publish endpoint.
export const PATCH = withAutomation(
  ["content:draft"],
  async (request: NextRequest, { auth, requestId, params }) => {
    const { siteId, account, scopes } = auth;
    const id = await draftIdFromRequest(request, params);
    if (!id) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid draft id", requestId);
    }

    const parsedBody = await parseJsonBody(request);
    if (parsedBody instanceof Response) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid JSON body", requestId);
    }

    const validated = parseDraftUpdateInput(parsedBody as Record<string, unknown>);
    if (!validated.ok) {
      return automationError(
        "AUTOMATION_VALIDATION_ERROR",
        "Draft update failed validation",
        requestId,
        { details: { errors: validated.errors.join("; ") } },
      );
    }

    const input = validated.value;
    if (Object.keys(input).length === 0) {
      return automationError("AUTOMATION_BAD_REQUEST", "No fields to update", requestId);
    }

    const existing = await getAIDraft(siteId, id, getAutomationDbClient);
    if (!existing) {
      return automationError("AUTOMATION_NOT_FOUND", "Draft not found", requestId);
    }

    if (input.status === "published") {
      if (!hasScope(scopes, "content:publish")) {
        return automationError(
          "AUTOMATION_SCOPE_MISSING",
          "Publishing requires scope content:publish",
          requestId,
          { details: { required_scope: "content:publish" } },
        );
      }

      // Apply any non-status overrides before promotion so the published content
      // reflects the final edited title/slug/body/etc.
      const { status: _status, ...nonStatusUpdates } = input;
      if (Object.keys(nonStatusUpdates).length > 0) {
        const updated = await updateAIDraft(siteId, id, nonStatusUpdates, getAutomationDbClient);
        if (!updated) {
          return automationError("AUTOMATION_NOT_FOUND", "Draft not found after update", requestId);
        }
      }

      try {
        const { content, draft: publishedDraft } = await publishDraft(siteId, id, account.id);
        return automationSuccess({ draft: publishedDraft, content }, requestId);
      } catch (err) {
        const status = (err as Error & { status?: number }).status;
        let code:
          | "AUTOMATION_NOT_FOUND"
          | "AUTOMATION_VALIDATION_ERROR"
          | "AUTOMATION_SLUG_CONFLICT"
          | "AUTOMATION_INTERNAL_ERROR" = "AUTOMATION_INTERNAL_ERROR";
        if (status === 404) code = "AUTOMATION_NOT_FOUND";
        if (status === 422) code = "AUTOMATION_VALIDATION_ERROR";
        if (status === 409 || (err instanceof Error && err.message.includes("slug conflict"))) {
          code = "AUTOMATION_SLUG_CONFLICT";
        }
        return automationError(
          code,
          err instanceof Error ? err.message : "Failed to publish draft",
          requestId,
        );
      }
    }

    const updated = await updateAIDraft(siteId, id, input, getAutomationDbClient);
    if (!updated) {
      return automationError("AUTOMATION_NOT_FOUND", "Draft not found", requestId);
    }

    return automationSuccess({ draft: updated }, requestId);
  },
);

// DELETE /api/automation/v1/content/drafts/:id
// Remove an AI draft (tenant-isolated).
export const DELETE = withAutomation(
  ["content:draft"],
  async (request: NextRequest, { auth, requestId, params }) => {
    const { siteId } = auth;
    const id = await draftIdFromRequest(request, params);
    if (!id) {
      return automationError("AUTOMATION_BAD_REQUEST", "Invalid draft id", requestId);
    }

    const existing = await getAIDraft(siteId, id, getAutomationDbClient);
    if (!existing) {
      return automationError("AUTOMATION_NOT_FOUND", "Draft not found", requestId);
    }

    await deleteAIDraft(siteId, id, getAutomationDbClient);

    return automationSuccess({ deleted: true, draft_id: id }, requestId);
  },
);
