import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listPages, createPage } from "@/lib/dal/pages";

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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/admin/pages  — create a new page
 * Body: { slug, title, body, is_published?, sort_order? }
 */
export async function POST(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
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
      body: body.body ?? "",
      is_published: body.is_published ?? false,
      sort_order: body.sort_order ?? 0,
    });

    return NextResponse.json(page, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
