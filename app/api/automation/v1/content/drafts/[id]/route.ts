import type { NextRequest } from "next/server";
import { withAutomation } from "@/lib/automation/gateway";
import { automationSuccess, automationError } from "@/lib/automation/envelope";
import { parseJsonBody } from "@/lib/api-error";
import { getAutomationDbClient } from "@/lib/automation/db";
import { parseDraftUpdateInput } from "@/lib/automation/schemas";
import { getAIDraft, updateAIDraft, deleteAIDraft } from "@/lib/dal/ai-drafts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function draftIdFromPath(request: NextRequest): string | null {
  const parts = request.nextUrl.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return last && UUID_RE.test(last) ? last : null;
}

// GET /api/automation/v1/content/drafts/:id
// Fetch a single AI draft (tenant-isolated).
export const GET = withAutomation(
  ["content:read"],
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId } = auth;
    const id = draftIdFromPath(request);
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
// Update an AI draft. Partial updates are allowed.
export const PATCH = withAutomation(
  ["content:draft"],
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId } = auth;
    const id = draftIdFromPath(request);
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
  async (request: NextRequest, { auth, requestId }) => {
    const { siteId } = auth;
    const id = draftIdFromPath(request);
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
