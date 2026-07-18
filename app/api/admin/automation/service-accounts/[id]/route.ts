import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import {
  getAutomationServiceAccountById,
  setAutomationServiceAccountStatus,
} from "@/lib/dal/automation-service-accounts";

const UUID_RE = /^[0-9a-fA-F-]{36}$/;

// DELETE /api/admin/automation/service-accounts/[id]
// Kill switch: revokes an automation service account (status -> revoked),
// immediately blocking all of its tokens at authentication. super_admin only.
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  try {
    const existing = await getAutomationServiceAccountById(id);
    if (!existing) {
      return NextResponse.json({ error: "Service account not found" }, { status: 404 });
    }

    const updated = await setAutomationServiceAccountStatus(id, "revoked");

    await recordAuditEvent({
      site_id: existing.site_id,
      actor: session.email ?? "admin",
      actor_user_id: session.userId,
      action: "automation.service_account.revoked",
      entity_type: "automation_service_account",
      entity_id: id,
      details: { name: existing.name },
    });

    return NextResponse.json({ ok: true, status: updated?.status ?? "revoked" });
  } catch (err) {
    captureException(err, {
      context: "[api/admin/automation/service-accounts/[id]] DELETE failed",
    });
    return NextResponse.json({ error: "Failed to revoke service account" }, { status: 500 });
  }
}
