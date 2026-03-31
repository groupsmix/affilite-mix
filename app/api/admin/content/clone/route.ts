import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { getContentById, createContent } from "@/lib/dal/content";
import { recordAuditEvent } from "@/lib/audit-log";

export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { id } = await request.json();
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    const original = await getContentById(dbSiteId, id);
    if (!original) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    const cloned = await createContent({
      site_id: dbSiteId,
      title: `${original.title} (Copy)`,
      slug: `${original.slug}-copy-${Date.now()}`,
      body: original.body,
      excerpt: original.excerpt,
      featured_image: original.featured_image,
      type: original.type,
      status: "draft",
      category_id: original.category_id,
      tags: original.tags,
      author: original.author,
      meta_title: original.meta_title,
      meta_description: original.meta_description,
      og_image: original.og_image,
    });

    revalidateTag("content");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "clone",
      entity_type: "content",
      entity_id: cloned.id,
      details: { original_id: id, title: cloned.title },
    });

    return NextResponse.json(cloned, { status: 201 });
  } catch (err) {
    console.error("[api/admin/content/clone] POST failed:", err);
    return NextResponse.json({ error: "Failed to clone content" }, { status: 500 });
  }
}
