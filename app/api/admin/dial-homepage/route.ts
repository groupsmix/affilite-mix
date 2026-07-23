import { NextResponse, type NextRequest } from "next/server";
import { withAuthz } from "@/lib/authz";
import { hasPermission } from "@/lib/dal/permissions";
import { getPageBySlug, createPage, updatePage } from "@/lib/dal/pages";
import { getTenantClientForSite } from "@/lib/supabase-server";
import {
  DIAL_HOMEPAGE_SLUG,
  defaultDialConfig,
  mergeWithDefault,
  type DialHomepageConfig,
} from "@/lib/dial-config";
import { parseJsonBody, apiError } from "@/lib/api-error";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/**
 * GET /api/admin/dial-homepage
 *
 * Returns the dashboard-editable dial homepage configuration for the active
 * site. If no configuration page exists yet, the default config is returned.
 */
export const GET = withAuthz("pages", "read", async (_request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("dial-homepage", session);
  if (rlResponse) return rlResponse;

  const userId = session.userId ?? "";
  if (!userId) {
    return apiError(401, "Unauthorized");
  }

  try {
    const page = await getPageBySlug(siteId, DIAL_HOMEPAGE_SLUG);

    if (!page?.body) {
      return NextResponse.json(defaultDialConfig);
    }

    try {
      const parsed = JSON.parse(page.body) as unknown;
      return NextResponse.json(mergeWithDefault(parsed));
    } catch {
      return NextResponse.json(defaultDialConfig);
    }
  } catch (err) {
    captureException(err, { context: "[api/admin/dial-homepage] GET failed" });
    return apiError(500, "Failed to load homepage config");
  }
});

/**
 * PUT /api/admin/dial-homepage
 *
 * Creates or updates the unpublished `dial-homepage` page for the active site.
 * The page body is raw JSON and is normalized by mergeWithDefault before being
 * persisted, so the public render always receives a valid DialHomepageConfig.
 */
export const PUT = withAuthz("pages", "edit", async (request, { session, siteId }) => {
  const rlResponse = await enforceAdminRateLimit("dial-homepage", session);
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

  const normalized: DialHomepageConfig = mergeWithDefault(bodyOrError.config);

  try {
    const getClient = () => getTenantClientForSite(siteId, userId);
    const existing = await getPageBySlug(siteId, DIAL_HOMEPAGE_SLUG);

    if (!existing) {
      const canCreate = await hasPermission(userId, siteId, "pages", "create");
      if (!canCreate) {
        return apiError(403, "You do not have permission to create the homepage config");
      }

      const page = await createPage(
        {
          site_id: siteId,
          slug: DIAL_HOMEPAGE_SLUG,
          title: "Dial Homepage Config",
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
        details: { slug: DIAL_HOMEPAGE_SLUG, title: "Dial Homepage Config" },
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
      details: { slug: DIAL_HOMEPAGE_SLUG },
    });

    return NextResponse.json(normalized);
  } catch (err) {
    captureException(err, { context: "[api/admin/dial-homepage] PUT failed" });
    return apiError(500, "Failed to save homepage config");
  }
});
