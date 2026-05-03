import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { updateAdminUser } from "@/lib/dal/admin-users";
import { recordAuditEvent } from "@/lib/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";

/** PATCH /api/admin/users/me — update own profile (name only) */
export async function PATCH(request: Request) {
  const { error, session } = await requireAdmin();
  if (error) return error;
  if (!session || !session.userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`admin:me:${session.userId}`, {
    maxRequests: 30,
    windowMs: 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const name = ((bodyOrError.name as string) ?? "").trim();
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    await updateAdminUser(session.userId, { name });
    // A8-05: Audit profile updates
    await recordAuditEvent({
      site_id: "__global__",
      actor: session.email ?? session.userId,
      actor_user_id: session.userId,
      action: "update",
      entity_type: "admin_user_profile",
      entity_id: session.userId,
      details: { field: "name" },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/users/me] PATCH failed" });
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
