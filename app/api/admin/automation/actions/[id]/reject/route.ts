import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { assertTransition } from "@/lib/automation/action-state";
import { getAutomationActionById, updateAutomationAction } from "@/lib/dal/automation-actions";
import { recordAuditEvent } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/api-error";
import { requireHumanAdmin } from "../../_shared";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(request);
  const { error } = admin;
  if (error) return error;
  const auth = await requireHumanAdmin(request, admin);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const action = await getAutomationActionById(auth.dbSiteId, id);
  if (!action) return NextResponse.json({ error: "Automation action not found" }, { status: 404 });
  if (action.status !== "manual_attention" && action.status !== "proposed") {
    return NextResponse.json(
      { error: `Action cannot be rejected from ${action.status}` },
      { status: 409 },
    );
  }
  const body = await parseJsonBody(request);
  if (body instanceof NextResponse) return body;
  const bodyRecord = body as Record<string, unknown>;
  const reason =
    typeof bodyRecord.reason === "string" ? bodyRecord.reason.trim().slice(0, 500) : "";
  try {
    assertTransition(action.status, "cancelled");
    const cancelled = await updateAutomationAction(
      auth.dbSiteId,
      action.id,
      {
        status: "cancelled",
        error_message: reason || null,
      },
      undefined,
      action.status,
    );
    await recordAuditEvent({
      site_id: auth.dbSiteId,
      actor: auth.session.email ?? auth.session.userId ?? "admin",
      actor_user_id: auth.session.userId,
      action: "automation.action.rejected",
      entity_type: "automation_action",
      entity_id: action.id,
      details: { action_type: action.action_type, reason },
    });
    return NextResponse.json({ action: cancelled ?? action });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Illegal automation action transition")
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
