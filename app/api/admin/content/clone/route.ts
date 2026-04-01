import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { getContentById, createContent } from "@/lib/dal/content";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const { id } = bodyOrError;
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
      publish_at: null,
      meta_title: original.meta_title,
      meta_description: original.meta_description,
      og_image: original.og_image,
      body_previous: null,
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
    captureException(err, { context: "[api/admin/content/clone] POST failed:" });
    return NextResponse.json({ error: "Failed to clone content" }, { status: 500 });
  }
}
