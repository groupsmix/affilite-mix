import { NextResponse, type NextRequest } from "next/server";
import { withAuthz } from "@/lib/authz";
import { hasPermission } from "@/lib/dal/permissions";
import { getPageBySlug, createPage, updatePage } from "@/lib/dal/pages";
import { getTenantClientForSite } from "@/lib/supabase-server";
import {
  DIAL_GUIDES_SLUG,
  defaultDialGuidesConfig,
  mergeDialGuidesConfig,
  type DialGuidesConfig,
} from "@/lib/dial-guides";
import { parseJsonBody, apiError } from "@/lib/api-error";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/dial-guides
 *
 * Returns the dashboard-editable dial guide config for the active site. Falls
 * back to the default guide content if no config page exists yet.
 */
export const GET = withAuthz("pages", "read", async (_request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("dial-guides", session);
  if (rlResponse) return rlResponse;

  const userId = session.userId ?? "";
  if (!userId) {
    return apiError(401, "Unauthorized");
  }

  try {
    const page = await getPageBySlug(siteId, DIAL_GUIDES_SLUG);

    if (!page?.body) {
      return NextResponse.json(defaultDialGuidesConfig);
    }

    try {
      const parsed = JSON.parse(page.body) as unknown;
      return NextResponse.json(mergeDialGuidesConfig(parsed));
    } catch {
      return NextResponse.json(defaultDialGuidesConfig);
    }
  } catch (err) {
    captureException(err, { context: "[api/admin/dial-guides] GET failed" });
    return apiError(500, "Failed to load dial guides config");
  }
});

/**
 * PUT /api/admin/dial-guides
 *
 * Creates or updates the unpublished `dial-guides` page for the active site.
 * The body is raw JSON and is normalized by mergeDialGuidesConfig before being
 * persisted, so the public render always receives a valid DialGuidesConfig.
 */
export const PUT = withAuthz("pages", "edit", async (request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("dial-guides", session);
  if (rlResponse) return rlResponse;

  const userId = session.userId ?? "";
  if (!userId) {
    return apiError(401, "Unauthorized");
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  if (bodyOrError.config === undefined) {
    return apiError(400, "Missing config field");
  }

  const normalized: DialGuidesConfig = mergeDialGuidesConfig(bodyOrError.config);

  try {
    const getClient = () => getTenantClientForSite(siteId, userId);
    const existing = await getPageBySlug(siteId, DIAL_GUIDES_SLUG);

    if (!existing) {
      const canCreate = await hasPermission(userId, siteId, "pages", "create");
      if (!canCreate) {
        return apiError(403, "You do not have permission to create the dial guides config");
      }

      const page = await createPage(
        {
          site_id: siteId,
          slug: DIAL_GUIDES_SLUG,
          title: "Dial Guides Config",
          body: JSON.stringify(normalized),
          is_published: false,
          sort_order: 999,
        },
        getClient,
      );

      void recordAuditEvent({
        site_id: siteId,
        actor: session.email ?? userId,
        action: "create",
        entity_type: "page",
        entity_id: page.id,
        details: { slug: DIAL_GUIDES_SLUG, title: "Dial Guides Config" },
      });

      return NextResponse.json(normalized, { status: 201 });
    }

    await updatePage(
      siteId,
      existing.id,
      {
        body: JSON.stringify(normalized),
      },
      getClient,
    );

    void recordAuditEvent({
      site_id: siteId,
      actor: session.email ?? userId,
      action: "update",
      entity_type: "page",
      entity_id: existing.id,
      details: { slug: DIAL_GUIDES_SLUG },
    });

    return NextResponse.json(normalized);
  } catch (err) {
    captureException(err, { context: "[api/admin/dial-guides] PUT failed" });
    return apiError(500, "Failed to save dial guides config");
  }
});
