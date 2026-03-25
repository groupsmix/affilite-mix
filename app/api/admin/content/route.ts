import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth";
import {
  listContent,
  createContent,
  updateContent,
  deleteContent,
} from "@/lib/dal/content";

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
  const content = await listContent({
    siteId: session.siteId,
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
  const content = await createContent({
    site_id: session.siteId,
    title: body.title,
    slug: body.slug,
    body: body.body ?? "",
    excerpt: body.excerpt ?? "",
    content_type: body.content_type ?? "article",
    status: body.status ?? "draft",
    category_id: body.category_id ?? null,
    featured_image: body.featured_image ?? null,
    meta_title: body.meta_title ?? null,
    meta_description: body.meta_description ?? null,
    tags: body.tags ?? [],
    published_at: body.published_at ?? null,
    author: body.author ?? null,
    metadata: body.metadata ?? {},
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

  const content = await updateContent(session.siteId, id, updates);
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

  await deleteContent(session.siteId, id);
  return NextResponse.json({ ok: true });
}
