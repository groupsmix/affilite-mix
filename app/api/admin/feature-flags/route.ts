import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import {
  listSiteFeatureFlags,
  upsertFeatureFlag,
  bulkUpsertFeatureFlags,
  deleteFeatureFlag,
} from "@/lib/dal/feature-flags";
import { recordAuditEvent } from "@/lib/audit-log";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody, apiError } from "@/lib/api-error";

/** GET /api/admin/feature-flags — list feature flags for the active site */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const GET = withAuthz(
  "feature-flags",
  "read",
  async (_request, { session, siteId: dbSiteId }) => {
    const rlError = await enforceAdminRateLimit("feature-flags", session);
    if (rlError) return rlError;

    try {
      const flags = await listSiteFeatureFlags(dbSiteId);
      return NextResponse.json({ flags });
    } catch (err) {
      captureException(err, { context: "[api/admin/feature-flags] GET failed:" });
      return apiError(500, "Failed to list feature flags", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);

/** POST /api/admin/feature-flags — upsert a feature flag for the active site */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const POST = withAuthz(
  "feature-flags",
  "configure",
  async (request, { session, siteId: dbSiteId }) => {
    const rlError = await enforceAdminRateLimit("feature-flags", session);
    if (rlError) return rlError;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError;

    const { flag_key, is_enabled } = body as {
      flag_key?: string;
      is_enabled?: boolean;
    };

    if (!flag_key || is_enabled === undefined) {
      return NextResponse.json({ error: "flag_key and is_enabled are required" }, { status: 400 });
    }

    // A-015: Always use server-derived active site id; reject body-level site_id if present.
    if (body.site_id && body.site_id !== dbSiteId) {
      return NextResponse.json({ error: "Forbidden: site_id mismatch" }, { status: 403 });
    }

    try {
      const flag = await upsertFeatureFlag({
        site_id: dbSiteId,
        flag_key,
        is_enabled,
        description: (body.description as string) ?? "",
      });

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? "admin",
        action: is_enabled ? "enable_feature_flag" : "disable_feature_flag",
        entity_type: "feature_flag",
        entity_id: flag_key,
        details: { flag_key, is_enabled },
      });

      return NextResponse.json(flag, { status: 200 });
    } catch (err) {
      captureException(err, { context: "[api/admin/feature-flags] POST failed:" });
      return NextResponse.json({ error: "Failed to upsert feature flag" }, { status: 500 });
    }
  },
);

/** PATCH /api/admin/feature-flags — bulk upsert feature flags for the active site */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const PATCH = withAuthz(
  "feature-flags",
  "configure",
  async (request, { session, siteId: dbSiteId }) => {
    const rlError = await enforceAdminRateLimit("feature-flags", session);
    if (rlError) return rlError;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError;

    const { flags } = body as {
      flags?: { flag_key: string; is_enabled: boolean; description?: string }[];
    };

    if (!flags || !Array.isArray(flags)) {
      return NextResponse.json({ error: "flags array is required" }, { status: 400 });
    }

    // A-015: Always use server-derived active site id; reject body-level site_id if present.
    if (body.site_id && body.site_id !== dbSiteId) {
      return NextResponse.json({ error: "Forbidden: site_id mismatch" }, { status: 403 });
    }

    try {
      const results = await bulkUpsertFeatureFlags(dbSiteId, flags);

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? "admin",
        action: "bulk_update_feature_flags",
        entity_type: "feature_flag",
        entity_id: dbSiteId,
        details: { flags_count: flags.length },
      });

      return NextResponse.json({ flags: results });
    } catch (err) {
      captureException(err, { context: "[api/admin/feature-flags] PATCH failed:" });
      return NextResponse.json({ error: "Failed to bulk upsert feature flags" }, { status: 500 });
    }
  },
);

/** DELETE /api/admin/feature-flags?flag_key=<key> — delete a flag for the active site */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const DELETE = withAuthz(
  "feature-flags",
  "delete",
  async (request, { session, siteId: dbSiteId }) => {
    const rlError = await enforceAdminRateLimit("feature-flags", session);
    if (rlError) return rlError;

    // A-015: Reject cross-tenant site_id query param; use server-derived active site.
    const querySiteId = request.nextUrl.searchParams.get("site_id");
    if (querySiteId && querySiteId !== dbSiteId) {
      return NextResponse.json({ error: "Forbidden: site_id mismatch" }, { status: 403 });
    }

    const flagKey = request.nextUrl.searchParams.get("flag_key");
    if (!flagKey) {
      return NextResponse.json({ error: "flag_key is required" }, { status: 400 });
    }
    if (flagKey.length > 128 || !/^[a-z0-9_-]+$/i.test(flagKey)) {
      return NextResponse.json({ error: "Invalid flag_key format" }, { status: 400 });
    }

    try {
      await deleteFeatureFlag(dbSiteId, flagKey);

      // S0-FP-002: await audit for destructive actions so the trail is durable.
      await recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? "admin",
        action: "delete_feature_flag",
        entity_type: "feature_flag",
        entity_id: flagKey,
      });

      return NextResponse.json({ ok: true });
    } catch (err) {
      captureException(err, { context: "[api/admin/feature-flags] DELETE failed:" });
      return NextResponse.json({ error: "Failed to delete feature flag" }, { status: 500 });
    }
  },
);
