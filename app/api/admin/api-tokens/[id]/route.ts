import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { captureException } from "@/lib/sentry";
import { recordAuditEvent } from "@/lib/audit-log";
import { deleteAdminApiToken } from "@/lib/dal/admin-api-tokens";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { error, session } = await requireAdmin(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roleError = assertRole(session, "super_admin");
  if (roleError) return roleError;

  const { id } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return NextResponse.json({ error: "Invalid token id" }, { status: 400 });
  }

  try {
    await deleteAdminApiToken(id);

    await recordAuditEvent({
      site_id: "_global",
      actor: session.email ?? "admin",
      actor_user_id: session.userId,
      action: "admin_api_token.deleted",
      entity_type: "admin_api_token",
      entity_id: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/api-tokens/[id]] DELETE failed" });
    return NextResponse.json({ error: "Failed to revoke API token" }, { status: 500 });
  }
}
