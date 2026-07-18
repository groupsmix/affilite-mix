import { NextResponse } from "next/server";
import { withAuthzDynamic, authorizeResource, authorizationErrorResponse } from "@/lib/authz";
import { getPageById, updatePage, deletePage } from "@/lib/dal/pages";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

/**
 * GET /api/admin/pages/:id  — get a single page
 */
export const GET = withAuthzDynamic(
  "pages",
  "read",
  async (_request, { session, siteId: dbSiteId, params }) => {
    const rlResponse = await enforceAdminRateLimit("pages-id", session);
    if (rlResponse) return rlResponse;

    try {
      const { id } = params;
      const page = await getPageById(dbSiteId, id!, () =>
        getTenantClientForSite(dbSiteId, session.userId),
      );
      if (!page) {
        return apiError(404, "Page not found", undefined, undefined, "NOT_FOUND");
      }
      return NextResponse.json(page);
    } catch (err) {
      captureException(err, { context: "[api/admin/pages] GET by id failed:" });
      return apiError(500, "Failed to get page", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);

/**
 * PATCH /api/admin/pages/:id  — update a page
 * Body: { slug?, title?, body?, is_published?, sort_order? }
 */
export const PATCH = withAuthzDynamic(
  "pages",
  "edit",
  async (request, { session, siteId: dbSiteId, params }) => {
    const rlResponse = await enforceAdminRateLimit("pages-id", session);
    if (rlResponse) return rlResponse;

    try {
      const { id } = params;

      // Defense-in-depth: derive the page's real site_id and require it to
      // match the active site. A forged `id` from a different tenant is a
      // 404 here instead of an opaque DAL failure later.
      const authz = await authorizeResource({
        session,
        feature: "pages",
        action: "edit",
        resourceType: "page",
        resourceId: id!,
        expectedSiteId: dbSiteId,
      });
      if (!authz.ok) return authorizationErrorResponse(authz);

      const rawOrError = await parseJsonBody(request);
      if (rawOrError instanceof NextResponse) return rawOrError;

      // Filter to allowed fields only — prevents mass assignment of id, site_id, created_at, etc.
      const ALLOWED_FIELDS = ["slug", "title", "body", "is_published", "sort_order"] as const;
      const filtered: Record<string, unknown> = {};
      for (const key of ALLOWED_FIELDS) {
        if (rawOrError[key] !== undefined) {
          filtered[key] =
            key === "body" ? sanitizeHtml(rawOrError[key] as string) : rawOrError[key];
        }
      }

      const page = await updatePage(dbSiteId, id!, filtered, () =>
        getTenantClientForSite(dbSiteId, session.userId),
      );

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "update",
        entity_type: "page",
        entity_id: id!,
        details: { fields: Object.keys(filtered) },
      });

      return NextResponse.json(page);
    } catch (err) {
      captureException(err, { context: "[api/admin/pages] PATCH failed:" });
      return apiError(500, "Failed to update page", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);

/**
 * DELETE /api/admin/pages/:id  — delete a page
 */
export const DELETE = withAuthzDynamic(
  "pages",
  "delete",
  async (_request, { session, siteId: dbSiteId, params }) => {
    const rlResponse = await enforceAdminRateLimit("pages-id", session);
    if (rlResponse) return rlResponse;

    try {
      const { id } = params;

      const authz = await authorizeResource({
        session,
        feature: "pages",
        action: "delete",
        resourceType: "page",
        resourceId: id!,
        expectedSiteId: dbSiteId,
      });
      if (!authz.ok) return authorizationErrorResponse(authz);

      await deletePage(dbSiteId, id!, () => getTenantClientForSite(dbSiteId, session.userId));

      // S0-FP-002: await audit for destructive actions so the trail is durable.
      await recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "delete",
        entity_type: "page",
        entity_id: id!,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/pages] DELETE failed:" });
      return apiError(500, "Failed to delete page", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);
