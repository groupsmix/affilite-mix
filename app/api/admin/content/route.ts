import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { contentTag } from "@/lib/cache-tags";
import { listContent, createContent, updateContent, deleteContent } from "@/lib/dal/content";
import {
  validateCreateContent,
  validateUpdateContent,
  CONTENT_TYPES,
  CONTENT_STATUSES,
} from "@/lib/validation";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { pingSitemapIndexers } from "@/lib/sitemap-ping";
import { getSiteById } from "@/config/sites";
import { getSiteRowBySlug } from "@/lib/dal/sites";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import { withAuthz, authorizeResource, authorizationErrorResponse } from "@/lib/authz";
import { validateAdminUrlFields } from "@/lib/admin-url-guard";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { isUsableUuid } from "@/lib/security/uuid";
import { canonicalizeVsSlug } from "@/lib/vs-slug";
import { getTenantClientForSite } from "@/lib/supabase-server";

export const GET = withAuthz(
  "content",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("content", session);
    if (rlResponse) return rlResponse;

    const { searchParams } = request.nextUrl;
    const pagination = parsePagination(searchParams);
    if (pagination instanceof NextResponse) return pagination;

    const contentType = searchParams.get("content_type");
    if (contentType && !CONTENT_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Invalid content_type. Must be one of: ${[...CONTENT_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    const status = searchParams.get("status");
    if (status && !CONTENT_STATUSES.has(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${[...CONTENT_STATUSES].join(", ")}` },
        { status: 400 },
      );
    }

    const categoryId = searchParams.get("category_id");
    if (categoryId && !isUsableUuid(categoryId)) {
      return NextResponse.json({ error: "Invalid category_id format" }, { status: 400 });
    }

    try {
      const getClient = () => getTenantClientForSite(siteId, session.userId);
      const content = await listContent(
        {
          siteId,
          contentType: contentType ?? undefined,
          status:
            (status as "draft" | "review" | "published" | "scheduled" | "archived") ?? undefined,
          categoryId: categoryId ?? undefined,
          limit: pagination.limit,
          offset: pagination.offset,
        },
        getClient,
      );

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
    // fail-open: best-effort [criticality:non-critical]
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
    // CA-302: store comparison slugs in canonical (alphabetical) order so the
    // public route, sitemap, and the middleware 301 redirect never diverge.
    // No-op for non-comparison slugs.
    const slug = data.type === "comparison" ? canonicalizeVsSlug(data.slug) : data.slug;
    // G-01: validate URL-typed fields before persistence.
    const urlErr = validateAdminUrlFields({
      featured_image: data.featured_image,
      og_image: data.og_image,
    });
    if (urlErr) {
      return NextResponse.json({ error: urlErr.error }, { status: 400 });
    }
    try {
      // Bind the tenant client to the withAuthz-validated `siteId` so the
      // minted JWT carries app_metadata.site_id and the write satisfies the
      // tenant_isolation RLS WITH CHECK; see the createCategory note in
      // app/api/admin/categories/route.ts for the full rationale.
      const content = await createContent(
        {
          site_id: siteId,
          title: data.title,
          slug,
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
        },
        () => getTenantClientForSite(siteId, session.userId),
      );

      void revalidateTag(contentTag(siteId));
      await recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "create",
        entity_type: "content",
        entity_id: content.id,
        details: { title: data.title, slug, type: data.type },
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

    // ISO18-003 / IDOR defense-in-depth (parity with products PATCH):
    // verify the content row belongs to the active tenant before any
    // mutation, so a stale id from another site cannot drive a write
    // even if RLS or the DAL site_id filter regresses (CWE-639).
    if (!id || !isUsableUuid(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }
    const authzResult = await authorizeResource({
      session,
      feature: "content",
      action: "edit",
      resourceType: "content",
      resourceId: id,
      expectedSiteId: siteId,
    });
    if (!authzResult.ok) {
      return authorizationErrorResponse(authzResult);
    }

    if (typeof updates.body === "string") {
      updates.body = sanitizeHtml(updates.body);
    }
    // CA-302: keep comparison slugs canonical on edit too. Applied when the
    // payload sets both slug and type=comparison; this avoids an extra DB read
    // on the hot path, and the backfill migration covers any historical rows.
    if (updates.slug !== undefined && updates.type === "comparison") {
      updates.slug = canonicalizeVsSlug(updates.slug);
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
      // S1-A18-001: Pass updated_at from client for optimistic locking.
      // If provided, the update only succeeds when the row hasn't changed.
      const expectedUpdatedAt = (parsed.data as unknown as Record<string, unknown>).updated_at as
        | string
        | undefined;
      const content = await updateContent(
        siteId,
        id,
        updates as Parameters<typeof updateContent>[2],
        () => getTenantClientForSite(siteId, session.userId),
        expectedUpdatedAt,
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
      // S1-A18-001: Optimistic lock conflict → 409
      if (err instanceof Error && (err as Error & { status?: number }).status === 409) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }
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

    // BUG-11: the original dual-path had a logic hole: parseJsonBody succeeds
    // even when the body is `{}` (no id field), so the query-param fallback
    // never fired for a request with `?id=<uuid>` but an empty body.
    // Fix: always read the query param first (it's the canonical DELETE idiom
    // for BulkActions), then fall back to the JSON body for the single-delete
    // button which sends `{ id }` as a body. This mirrors how products DELETE
    // already works and eliminates the suppression bug.
    let id: string | null = request.nextUrl.searchParams.get("id");
    if (!id) {
      const rawOrError = await parseJsonBody(request);
      if (!(rawOrError instanceof NextResponse)) {
        id = typeof rawOrError.id === "string" ? rawOrError.id : null;
      }
    }
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    // RC-05: Validate UUID format before hitting the database
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
    }

    try {
      await deleteContent(siteId, id, () => getTenantClientForSite(siteId, session.userId));
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
