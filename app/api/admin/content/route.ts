import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listContent,
  createContent,
  updateContent,
  deleteContent,
} from "@/lib/dal/content";
import { validateCreateContent, validateUpdateContent } from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize-html";

export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
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
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateCreateContent(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  const data = parsed.data;
  const content = await createContent({
    site_id: dbSiteId,
    title: data.title,
    slug: data.slug,
    body: sanitizeHtml(data.body),
    excerpt: data.excerpt,
    type: data.type,
    status: data.status,
    category_id: data.category_id,
    tags: data.tags,
    author: data.author,
  });

  return NextResponse.json(content, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const raw = await request.json();
  const parsed = validateUpdateContent(raw);
  if (parsed.errors) {
    return NextResponse.json({ error: "Validation failed", details: parsed.errors }, { status: 400 });
  }

  const { id, ...updates } = parsed.data;
  // Remap content_type -> type if sent from the form
  if (updates.content_type) {
    updates.type = updates.content_type;
    delete updates.content_type;
  }
  // Sanitize HTML body if present
  if (typeof updates.body === "string") {
    updates.body = sanitizeHtml(updates.body);
  }
  const content = await updateContent(dbSiteId, id, updates);
  return NextResponse.json(content);
}

export async function DELETE(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await deleteContent(dbSiteId, id);
  return NextResponse.json({ ok: true });
}
