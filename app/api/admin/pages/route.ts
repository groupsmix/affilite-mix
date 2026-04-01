import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listPages, createPage } from "@/lib/dal/pages";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";

/**
 * GET /api/admin/pages  — list all pages for the current site
 */
export async function GET() {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const pages = await listPages(dbSiteId);
    return NextResponse.json(pages);
  } catch (err) {
    captureException(err, { context: "[api/admin/pages] GET failed:" });
    return NextResponse.json({ error: "Failed to list pages" }, { status: 500 });
  }
}

/**
 * POST /api/admin/pages  — create a new page
 * Body: { slug, title, body, is_published?, sort_order? }
 */
export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();

    if (!body.slug || !body.title) {
      return NextResponse.json({ error: "slug and title are required" }, { status: 400 });
    }

    const page = await createPage({
      site_id: dbSiteId,
      slug: body.slug,
      title: body.title,
      body: sanitizeHtml(body.body ?? ""),
      is_published: body.is_published ?? false,
      sort_order: body.sort_order ?? 0,
    });

    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "create",
      entity_type: "page",
      entity_id: page.id,
      details: { title: body.title, slug: body.slug },
    });

    return NextResponse.json(page, { status: 201 });
  } catch (err) {
    captureException(err, { context: "[api/admin/pages] POST failed:" });
    return NextResponse.json({ error: "Failed to create page" }, { status: 500 });
  }
}
