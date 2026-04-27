import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { contentTag } from "@/lib/cache-tags";
import { listContent, createContent, updateContent, deleteContent } from "@/lib/dal/content";
import { validateCreateContent, validateUpdateContent } from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { pingSitemapIndexers } from "@/lib/sitemap-ping";
import { getSiteById } from "@/config/sites";
import { getSiteRowBySlug } from "@/lib/dal/sites";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { withAuthz } from "@/lib/authz";

export const GET = withAuthz("content", "view", async (request: NextRequest, { siteId }) => {
  const { searchParams } = request.nextUrl;
  const pagination = parsePagination(searchParams);
  if (pagination instanceof NextResponse) return pagination;

  try {
    const content = await listContent({
      siteId,
      contentType: searchParams.get("content_type") ?? undefined,
      status:
        (searchParams.get("status") as
          | "draft"
          | "review"
          | "published"
          | "scheduled"
          | "archived") ?? undefined,
      categoryId: searchParams.get("category_id") ?? undefined,
      limit: pagination.limit,
      offset: pagination.offset,
    });

    return NextResponse.json(content);
  } catch (err) {
    captureException(err, { context: "[api/admin/content] GET failed:" });
    return NextResponse.json({ error: "Failed to list content" }, { status: 500 });
  }
});

/**
 * Resolve the site domain for sitemap pinging.
 * Tries static config first, falls back to DB for admin-panel-created sites.
 */
async function resolveSiteDomain(siteSlug: string): Promise<string | null> {
  const configSite = getSiteById(siteSlug);
  if (configSite) return configSite.domain;
  try {
    const dbRow = await getSiteRowBySlug(siteSlug);
    return dbRow?.domain ?? null;
  } catch {
    return null;
  }
}

export const POST = withAuthz(
  "content",
  "create",
  async (request: NextRequest, { session, siteId, siteSlug }) => {
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
        site_id: siteId,
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
        review_state: "draft",
      });

      void revalidateTag(contentTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "create",
        entity_type: "content",
        entity_id: content.id,
        details: { title: data.title, slug: data.slug, type: data.type },
      });

      if (data.status === "published") {
        const domain = await resolveSiteDomain(siteSlug);
        if (domain) {
          void pingSitemapIndexers(`https://${domain}/sitemap.xml`);
        }
      }

      return NextResponse.json(content, { status: 201 });
    } catch (err) {
      captureException(err, { context: "[api/admin/content] POST create failed:" });
      return NextResponse.json({ error: "Failed to create content" }, { status: 500 });
    }
  },
);

export const PATCH = withAuthz(
  "content",
  "edit",
  async (request: NextRequest, { session, siteId, siteSlug }) => {
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
    if (typeof updates.body === "string") {
      updates.body = sanitizeHtml(updates.body);
    }
    try {
      const content = await updateContent(
        siteId,
        id,
        updates as Parameters<typeof updateContent>[2],
      );
      void revalidateTag(contentTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "update",
        entity_type: "content",
        entity_id: id,
        details: { fields: Object.keys(updates) },
      });

      if (updates.status === "published") {
        const domain = await resolveSiteDomain(siteSlug);
        if (domain) {
          void pingSitemapIndexers(`https://${domain}/sitemap.xml`);
        }
      }

      return NextResponse.json(content);
    } catch (err) {
      captureException(err, { context: "[api/admin/content] PATCH update failed:" });
      return NextResponse.json({ error: "Failed to update content" }, { status: 500 });
    }
  },
);

export const DELETE = withAuthz(
  "content",
  "delete",
  async (request: NextRequest, { session, siteId }) => {
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
      await deleteContent(siteId, id);
      void revalidateTag(contentTag(siteId));
      void recordAuditEvent({
        site_id: siteId,
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
  },
);
