import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { reorderPages } from "@/lib/dal/pages";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

/**
 * PUT /api/admin/pages/reorder
 * Body: { pages: [{ id, sort_order }] }
 */
export async function PUT(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError;

    if (!Array.isArray(body.pages)) {
      return NextResponse.json({ error: "pages array is required" }, { status: 400 });
    }

    await reorderPages(dbSiteId, body.pages);

    void recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "reorder",
      entity_type: "page",
      entity_id: "bulk",
      details: { count: body.pages.length },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/pages] reorder failed:" });
    return NextResponse.json({ error: "Failed to reorder pages" }, { status: 500 });
  }
}
