import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/admin-guard";
import { listContent, createContent, updateContent, deleteContent } from "@/lib/dal/content";
import { validateCreateContent, validateUpdateContent } from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { pingSitemapIndexers } from "@/lib/sitemap-ping";
import { getSiteById } from "@/config/sites";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

export async function GET(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const { searchParams } = request.nextUrl;
  try {
    const content = await listContent({
      siteId: dbSiteId,
      contentType: searchParams.get("content_type") ?? undefined,
      status:
        (searchParams.get("status") as
          | "draft"
          | "review"
          | "published"
          | "scheduled"
          | "archived") ?? undefined,
      categoryId: searchParams.get("category_id") ?? undefined,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : undefined,
      offset: searchParams.get("offset") ? Number(searchParams.get("offset")) : undefined,
    });

    return NextResponse.json(content);
  } catch (err) {
    captureException(err, { context: "[api/admin/content] GET failed:" });
    return NextResponse.json({ error: "Failed to list content" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const parsed = validateCreateContent(rawOrError);
  if (parsed.errors) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.errors },
      { status: 400 },
    );
  }

  const data = parsed.data;
  try {
    const content = await createContent({
      site_id: dbSiteId,
      title: data.title,
      slug: data.slug,
      body: sanitizeHtml(data.body),
      excerpt: data.excerpt,
      featured_image: data.featured_image ?? "",
      type: data.type,
      status: data.status,
      category_id: data.category_id,
      tags: data.tags,
      author: data.author,
      publish_at: data.publish_at,
      meta_title: data.meta_title,
      meta_description: data.meta_description,
      og_image: data.og_image,
      body_previous: null,
    });

    revalidateTag("content");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "create",
      entity_type: "content",
      entity_id: content.id,
      details: { title: data.title, slug: data.slug, type: data.type },
    });

    // Ping search engines when content is published
    if (data.status === "published") {
      const siteSlug = request.headers.get("x-site-id");
      const site = siteSlug ? getSiteById(siteSlug) : null;
      if (site) {
        pingSitemapIndexers(`https://${site.domain}/sitemap.xml`);
      }
    }

    return NextResponse.json(content, { status: 201 });
  } catch (err) {
    captureException(err, { context: "[api/admin/content] POST create failed:" });
    return NextResponse.json({ error: "Failed to create content" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const rawOrError = await parseJsonBody(request);
  if (rawOrError instanceof NextResponse) return rawOrError;
  const parsed = validateUpdateContent(rawOrError);
  if (parsed.errors) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.errors },
      { status: 400 },
    );
  }

  const { id, ...updates } = parsed.data;
  // Sanitize HTML body if present
  if (typeof updates.body === "string") {
    updates.body = sanitizeHtml(updates.body);
  }
  try {
    const content = await updateContent(
      dbSiteId,
      id,
      updates as Parameters<typeof updateContent>[2],
    );
    revalidateTag("content");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "update",
      entity_type: "content",
      entity_id: id,
      details: { fields: Object.keys(updates) },
    });

    // Ping search engines when content is published
    if (updates.status === "published") {
      const siteSlug = request.headers.get("x-site-id");
      const site = siteSlug ? getSiteById(siteSlug) : null;
      if (site) {
        pingSitemapIndexers(`https://${site.domain}/sitemap.xml`);
      }
    }

    return NextResponse.json(content);
  } catch (err) {
    captureException(err, { context: "[api/admin/content] PATCH update failed:" });
    return NextResponse.json({ error: "Failed to update content" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  // Accept id from request body (preferred) or query params (backward compat)
  let id: string | null = null;
  try {
    const body = await request.json();
    id = body?.id ?? null;
  } catch {
    // fallback to query params for backward compatibility
  }
  if (!id) {
    id = request.nextUrl.searchParams.get("id");
  }
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  try {
    await deleteContent(dbSiteId, id);
    revalidateTag("content");
    recordAuditEvent({
      site_id: dbSiteId,
      actor: session.email ?? session.userId ?? "admin",
      action: "delete",
      entity_type: "content",
      entity_id: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/content] DELETE failed:" });
    return NextResponse.json({ error: "Failed to delete content" }, { status: 500 });
  }
}
