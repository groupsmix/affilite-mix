import { NextResponse } from "next/server";
import { withAuthzDynamic, authorizeResource, authorizationErrorResponse } from "@/lib/authz";
import { updateAdPlacement, deleteAdPlacement } from "@/lib/dal/ad-placements";
import { recordAuditEvent } from "@/lib/audit-log";
import { parseJsonBody } from "@/lib/api-error";
import type { AdPlacementType, AdProvider } from "@/types/database";
import { parseImageAdConfig } from "@/lib/ads/image-ad";
import { captureException } from "@/lib/sentry";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

const VALID_PLACEMENT_TYPES: AdPlacementType[] = [
  "sidebar",
  "in_content",
  "header",
  "footer",
  "between_posts",
];
const VALID_PROVIDERS: AdProvider[] = ["adsense", "carbon", "ethicalads", "custom", "image"];

export const PUT = withAuthzDynamic(
  "ads",
  "edit",
  async (request, { session, siteId: dbSiteId, params }) => {
    const rlResponse = await enforceAdminRateLimit("ads-id", session);
    if (rlResponse) return rlResponse;

    const { id } = params;

    // Defense-in-depth: derive the placement's real site_id and require it
    // to match the active site. A forged `id` from a different tenant is a
    // 404 here instead of a silent no-op or 500.
    const authz = await authorizeResource({
      session,
      feature: "ads",
      action: "edit",
      resourceType: "ad_placement",
      resourceId: id!,
      expectedSiteId: dbSiteId,
    });
    if (!authz.ok) return authorizationErrorResponse(authz);

    const rawOrError = await parseJsonBody(request);
    if (rawOrError instanceof NextResponse) return rawOrError;

    const name = rawOrError.name as string | undefined;
    const placement_type = rawOrError.placement_type as AdPlacementType | undefined;
    const provider = rawOrError.provider as AdProvider | undefined;
    const ad_code = rawOrError.ad_code as string | undefined;
    const config = rawOrError.config as Record<string, unknown> | undefined;
    const is_active = rawOrError.is_active as boolean | undefined;
    const priority = rawOrError.priority as number | undefined;

    if (placement_type && !VALID_PLACEMENT_TYPES.includes(placement_type)) {
      return NextResponse.json(
        { error: `placement_type must be one of: ${VALID_PLACEMENT_TYPES.join(", ")}` },
        { status: 400 },
      );
    }
    if (provider && !VALID_PROVIDERS.includes(provider)) {
      return NextResponse.json(
        { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 },
      );
    }

    // When switching to / saving an image ad, validate the creative +
    // destination and force ad_code null (same rules as create).
    let resolvedConfig = config;
    let resolvedAdCode = ad_code;
    if (provider === "image") {
      const imageConfig = parseImageAdConfig(config);
      if ("error" in imageConfig) {
        return NextResponse.json({ error: imageConfig.error }, { status: 400 });
      }
      resolvedConfig = { ...(config ?? {}), ...imageConfig };
      resolvedAdCode = undefined;
    }

    try {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (placement_type !== undefined) updates.placement_type = placement_type;
      if (provider !== undefined) updates.provider = provider;
      if (provider === "image") {
        updates.ad_code = null;
      } else if (resolvedAdCode !== undefined) {
        updates.ad_code = resolvedAdCode;
      }
      if (resolvedConfig !== undefined) updates.config = resolvedConfig;
      if (is_active !== undefined) updates.is_active = is_active;
      if (priority !== undefined) updates.priority = priority;

      const ad = await updateAdPlacement(dbSiteId, id!, updates, () =>
        getTenantClientForSite(dbSiteId, session.userId),
      );

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "update",
        entity_type: "ad_placement",
        entity_id: id!,
        details: updates,
      });

      return NextResponse.json(ad);
    } catch (err) {
      captureException(err, { context: "[api/admin/ads] PUT failed:" });
      return NextResponse.json({ error: "Failed to update ad placement" }, { status: 500 });
    }
  },
);

export const DELETE = withAuthzDynamic(
  "ads",
  "delete",
  async (_request, { session, siteId: dbSiteId, params }) => {
    const rlResponse = await enforceAdminRateLimit("ads-id", session);
    if (rlResponse) return rlResponse;

    const { id } = params;

    const authz = await authorizeResource({
      session,
      feature: "ads",
      action: "delete",
      resourceType: "ad_placement",
      resourceId: id!,
      expectedSiteId: dbSiteId,
    });
    if (!authz.ok) return authorizationErrorResponse(authz);

    try {
      await deleteAdPlacement(dbSiteId, id!, () =>
        getTenantClientForSite(dbSiteId, session.userId),
      );

      // S0-FP-002: await audit for destructive actions so the trail is durable.
      await recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? session.userId ?? "admin",
        action: "delete",
        entity_type: "ad_placement",
        entity_id: id!,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/ads] DELETE failed:" });
      return NextResponse.json({ error: "Failed to delete ad placement" }, { status: 500 });
    }
  },
);
