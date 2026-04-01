import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { getPageById, updatePage, deletePage } from "@/lib/dal/pages";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/pages/:id  — get a single page
 */
export async function GET(_request: NextRequest, { params }: Params) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const page = await getPageById(id);
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    return NextResponse.json(page);
  } catch (err) {
    captureException(err, { context: "[api/admin/pages] GET by id failed:" });
    return NextResponse.json({ error: "Failed to get page" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/pages/:id  — update a page
 * Body: { slug?, title?, body?, is_published?, sort_order? }
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;

    // Filter to allowed fields only — prevents mass assignment of id, site_id, created_at, etc.
    const ALLOWED_FIELDS = ["slug", "title", "body", "is_published", "sort_order"] as const;
    const filtered: Record<string, unknown> = {};
    for (const key of ALLOWED_FIELDS) {
      if (rawOrError[key] !== undefined) {
        filtered[key] = key === "body" ? sanitizeHtml(rawOrError[key] as string) : rawOrError[key];
      }
    }

    const page = await updatePage(id, filtered);

    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "update",
      entity_type: "page",
      entity_id: id,
      details: { fields: Object.keys(filtered) },
    });

    return NextResponse.json(page);
  } catch (err) {
    captureException(err, { context: "[api/admin/pages] PATCH failed:" });
    return NextResponse.json({ error: "Failed to update page" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/pages/:id  — delete a page
 */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const { id } = await params;
    await deletePage(id);

    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "delete",
      entity_type: "page",
      entity_id: id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/pages] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete page" }, { status: 500 });
  }
}
