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
  if (action.status !== "succeeded") {
    return NextResponse.json(
      { error: "Only succeeded actions can be rolled back" },
      { status: 409 },
    );
  }
  if (!action.before_snapshot || !action.after_snapshot) {
    return NextResponse.json({ error: "Action has no rollback snapshots" }, { status: 409 });
  }
  const executor = getExecutor(action.action_type as ActionType);
  if (!executor?.rollback) {
    return NextResponse.json(
      { error: "This action type does not support rollback" },
      { status: 409 },
    );
  }
  try {
    assertTransition(action.status, "rolled_back");
    const result = await executor.rollback(action, { siteId: auth.dbSiteId });
    const rolledBack = await updateAutomationAction(auth.dbSiteId, action.id, {
      status: "rolled_back",
      result,
    });
    await recordAuditEvent({
      site_id: auth.dbSiteId,
      actor: auth.session.email ?? auth.session.userId ?? "admin",
      actor_user_id: auth.session.userId,
      action: "automation.action.rolled_back",
      entity_type: "automation_action",
      entity_id: action.id,
      details: { action_type: action.action_type },
    });
    return NextResponse.json({ action: rolledBack ?? action });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Illegal automation action transition")
    ) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const status = (error as Error & { status?: number }).status;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Rollback failed" },
      { status: status === 409 ? 409 : 422 },
    );
  }
}
