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
import { validateAdminUrlFields } from "@/lib/admin-url-guard";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

export const GET = withAuthz(
  "content",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("content", session);
    if (rlResponse) return rlResponse;

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
  },
);

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
    // fail-open: best-effort
    return null;
  }
}

export const POST = withAuthz(
  "content",
  "create",
  async (request: NextRequest, { session, siteId, siteSlug }) => {
    const rlResponse = await enforceAdminRateLimit("content", session);
    if (rlResponse) return rlResponse;

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
    // G-01: validate URL-typed fields before persistence.
    const urlErr = validateAdminUrlFields({
      featured_image: data.featured_image,
      og_image: data.og_image,
    });
    if (urlErr) {
      return NextResponse.json({ error: urlErr.error }, { status: 400 });
    }
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
      await recordAuditEvent({
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
    const rlResponse = await enforceAdminRateLimit("content", session);
    if (rlResponse) return rlResponse;

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
    // G-01: validate URL-typed fields on edit.
    const editUrlFields: Record<string, string | null | undefined> = {};
    if (updates.featured_image !== undefined) editUrlFields.featured_image = updates.featured_image;
    if (updates.og_image !== undefined) editUrlFields.og_image = updates.og_image;
    const editUrlErr = validateAdminUrlFields(editUrlFields);
    if (editUrlErr) {
      return NextResponse.json({ error: editUrlErr.error }, { status: 400 });
    }
    try {
      const content = await updateContent(
        siteId,
        id,
        updates as Parameters<typeof updateContent>[2],
      );
      void revalidateTag(contentTag(siteId));
      await recordAuditEvent({
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
    const rlResponse = await enforceAdminRateLimit("content", session);
    if (rlResponse) return rlResponse;

    let id: string | null = null;
    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) {
      // JSON parse failed — fallback to query params for backward compatibility
    } else {
      id = typeof rawOrError.id === "string" ? rawOrError.id : null;
    }
    if (!id) {
      id = request.nextUrl.searchParams.get("id");
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    // RC-05: Validate UUID format before hitting the database
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    try {
      await deleteContent(siteId, id);
      void revalidateTag(contentTag(siteId));
      // G-06: Await audit for content deletion.
      await recordAuditEvent({
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
