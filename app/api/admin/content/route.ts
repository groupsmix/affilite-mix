import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listContent,
  createContent,
  updateContent,
  deleteContent,
} from "@/lib/dal/content";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const dbSiteId = await resolveDbSiteId(session.siteId);
  const content = await listContent({
    siteId: dbSiteId,
    contentType: searchParams.get("content_type") ?? undefined,
    status:
      (searchParams.get("status") as "draft" | "review" | "published" | "archived") ?? undefined,
    categoryId: searchParams.get("category_id") ?? undefined,
    limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
    offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
  });

  return NextResponse.json(content);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const dbSiteId = await resolveDbSiteId(session.siteId);
  const content = await createContent({
    site_id: dbSiteId,
    title: body.title,
    slug: body.slug,
    body: body.body ?? "",
    excerpt: body.excerpt ?? "",
    type: body.content_type ?? body.type ?? "article",
    status: body.status ?? "draft",
    category_id: body.category_id ?? null,
    tags: body.tags ?? [],
    author: body.author ?? null,
  });

  return NextResponse.json(content, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const dbSiteId = await resolveDbSiteId(session.siteId);
  // Remap content_type -> type if sent from the form
  if (updates.content_type) {
    updates.type = updates.content_type;
    delete updates.content_type;
  }
  const content = await updateContent(dbSiteId, id, updates);
  return NextResponse.json(content);
}

export async function DELETE(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const dbSiteId = await resolveDbSiteId(session.siteId);
  await deleteContent(dbSiteId, id);
  return NextResponse.json({ ok: true });
}
