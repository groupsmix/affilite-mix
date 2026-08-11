import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { assertTransition } from "@/lib/automation/action-state";
import type { ActionType } from "@/lib/automation/policy";
import { getExecutor } from "@/lib/automation/executors/registry";
import { getAutomationActionById, updateAutomationAction } from "@/lib/dal/automation-actions";
import { recordAuditEvent } from "@/lib/audit-log";
import { requireHumanAdmin } from "../../_shared";

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { error } = admin;
  if (error) return error;
  const auth = await requireHumanAdmin(request, admin);
  if (auth.response) return auth.response;
  const { id } = await ctx.params;
  const action = await getAutomationActionById(auth.dbSiteId, id);
  if (!action) return NextResponse.json({ error: "Automation action not found" }, { status: 404 });
  if (action.status !== "manual_attention" && action.status !== "proposed") {
    return NextResponse.json(
      { error: `Action cannot be approved from ${action.status}` },
      { status: 409 },
    );
  }
  const executor = getExecutor(action.action_type as ActionType);
  if (!executor) {
    return NextResponse.json(
      { error: "No executor is registered for this action type" },
      { status: 409 },
    );
  }
  try {
    assertTransition(action.status, "approved");
    const approved = await updateAutomationAction(auth.dbSiteId, action.id, {
      status: "approved",
      approved_by: auth.session.userId,
      approved_at: new Date().toISOString(),
    });
    if (!approved)
      return NextResponse.json({ error: "Automation action not found" }, { status: 404 });
    const running = await updateAutomationAction(auth.dbSiteId, action.id, { status: "running" });
    if (!running)
      return NextResponse.json({ error: "Automation action not found" }, { status: 404 });
    try {
      const execution = await executor.execute(running, { siteId: auth.dbSiteId });
      const succeeded = await updateAutomationAction(auth.dbSiteId, action.id, {
        status: "succeeded",
        target_id: execution.targetId ?? running.target_id,
        before_snapshot: execution.beforeSnapshot ?? null,
        after_snapshot: execution.afterSnapshot ?? null,
        result: execution.result,
      });
      await recordAuditEvent({
        site_id: auth.dbSiteId,
        actor: auth.session.email ?? auth.session.userId ?? "admin",
        actor_user_id: auth.session.userId,
        action: "automation.action.approved",
        entity_type: "automation_action",
        entity_id: action.id,
        details: { action_type: action.action_type },
      });
      return NextResponse.json({ action: succeeded ?? running }, { status: 200 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Approved action failed";
      const failed = await updateAutomationAction(auth.dbSiteId, action.id, {
        status: "failed",
        error_code: (error as Error & { code?: string }).code ?? "AUTOMATION_EXECUTION_FAILED",
        error_message: message.slice(0, 500),
      });
      await recordAuditEvent({
        site_id: auth.dbSiteId,
        actor: auth.session.email ?? auth.session.userId ?? "admin",
        actor_user_id: auth.session.userId,
        action: "automation.action.approved",
        entity_type: "automation_action",
        entity_id: action.id,
        details: { action_type: action.action_type },
      });
      return NextResponse.json({ error: message, action: failed }, { status: 422 });
    }
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
