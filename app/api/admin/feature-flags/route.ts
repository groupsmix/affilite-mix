import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { assertRole } from "@/lib/admin-guard";
import {
  listSiteFeatureFlags,
  upsertFeatureFlag,
  bulkUpsertFeatureFlags,
  deleteFeatureFlag,
} from "@/lib/dal/feature-flags";
import { getSiteRowById, updateSiteFeatures } from "@/lib/dal/sites";
import { KNOWN_FEATURES, isKnownFeatureKey, normalizeFlagKey } from "@/lib/feature-flag-keys";
// FIX: `site_feature_flags` is RLS-restricted to service_role (migrations
// 00033 / 00040). The default tenant client (authenticated role) is denied,
// so these admin reads/writes must use the privileged gateway. Each handler
// also asserts super_admin as defense-in-depth (F2/F3/F7 invariant): these
// handlers read/write the global `sites` registry (readLiveFeatures and
// updateSiteFeatures bypass DB-level site scoping), and a site-scoped withAuthz
// permission alone is not sufficient for global-registry access, matching
// app/api/admin/permissions and app/api/admin/analytics/domains. Every DAL
// call is still scoped to the server-derived active site.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { recordAuditEvent } from "@/lib/audit-log";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody, apiError } from "@/lib/api-error";

/**
 * Feature flags are split into two kinds:
 *
 *  - "Live" features (KNOWN_FEATURES) are stored in the `sites.features` jsonb
 *    column — the column the runtime actually reads (lib/site-context.ts), so
 *    toggling them genuinely gates the feature site-wide after cache
 *    revalidation.
 *  - "Custom" flags (any other key) are stored in `site_feature_flags` for a
 *    team's own code to read via a custom check. They have no built-in runtime
 *    effect by themselves.
 *
 * This is why the old page felt "fake": every toggle wrote to
 * `site_feature_flags`, which nothing read. Live features now route to
 * `sites.features` instead.
 */

/** Read the site's effective live-feature state from `sites.features`. */
async function readLiveFeatures(dbSiteId: string) {
  const siteRow = await getSiteRowById(dbSiteId, () =>
    getPrivilegedSupabaseClient("admin-feature-flags-site-read"),
  );
  const stored = (siteRow?.features as Record<string, unknown> | null) ?? {};
  return KNOWN_FEATURES.map((f) => ({
    key: f.key,
    label: f.label,
    description: f.description,
    is_enabled: typeof stored[f.key] === "boolean" ? (stored[f.key] as boolean) : f.defaultEnabled,
  }));
}

/** GET /api/admin/feature-flags — list live features + custom flags for the active site */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const GET = withAuthz(
  "feature-flags",
  "read",
  async (_request, { session, siteId: dbSiteId }) => {
    // F2/F3/F7: this handler reads the global `sites` registry, so require super_admin.
    const roleError = assertRole(session, "super_admin");
    if (roleError) return roleError;

    const rlError = await enforceAdminRateLimit("feature-flags", session);
    if (rlError) return rlError;

    try {
      const [allFlags, features] = await Promise.all([
        listSiteFeatureFlags(dbSiteId, () =>
          getPrivilegedSupabaseClient("admin-feature-flags-list"),
        ),
        readLiveFeatures(dbSiteId),
      ]);

      // Custom flags only — live features are surfaced via `features` above so
      // they are not duplicated in the custom list.
      const flags = allFlags.filter((f) => !isKnownFeatureKey(f.flag_key));

      return NextResponse.json({ flags, features });
    } catch (err) {
      captureException(err, { context: "[api/admin/feature-flags] GET failed:" });
      return apiError(500, "Failed to list feature flags", undefined, undefined, "INTERNAL_ERROR");
    }
  },
);

/** POST /api/admin/feature-flags — toggle a live feature OR upsert a custom flag */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const POST = withAuthz(
  "feature-flags",
  "configure",
  async (request, { session, siteId: dbSiteId }) => {
    // F2/F3/F7: this handler reads/writes the global `sites` registry, so require super_admin.
    const roleError = assertRole(session, "super_admin");
    if (roleError) return roleError;

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

    const normalizedKey = normalizeFlagKey(flag_key);

    try {
      // Live feature → write through to `sites.features` so the toggle takes
      // effect on the site itself.
      if (isKnownFeatureKey(normalizedKey)) {
        await updateSiteFeatures(dbSiteId, { [normalizedKey]: is_enabled }, () =>
          getPrivilegedSupabaseClient("admin-feature-flags-site-update"),
        );

        void recordAuditEvent({
          site_id: dbSiteId,
          actor: session.email ?? "admin",
          action: is_enabled ? "enable_feature_flag" : "disable_feature_flag",
          entity_type: "site_feature",
          entity_id: normalizedKey,
          details: { flag_key: normalizedKey, is_enabled, live: true },
        });

        return NextResponse.json(
          { ok: true, flag_key: normalizedKey, is_enabled, live: true },
          { status: 200 },
        );
      }

      // Custom flag → stored in site_feature_flags (no built-in runtime effect).
      const flag = await upsertFeatureFlag(
        {
          site_id: dbSiteId,
          flag_key,
          is_enabled,
          description: (body.description as string) ?? "",
        },
        () => getPrivilegedSupabaseClient("admin-feature-flags-upsert"),
      );

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

/** PATCH /api/admin/feature-flags — bulk update live features and/or custom flags */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const PATCH = withAuthz(
  "feature-flags",
  "configure",
  async (request, { session, siteId: dbSiteId }) => {
    // F2/F3/F7: this handler reads/writes the global `sites` registry, so require super_admin.
    const roleError = assertRole(session, "super_admin");
    if (roleError) return roleError;

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

    // Split into live-feature overrides (sites.features) and custom flags.
    const liveOverrides: Record<string, boolean> = {};
    const customFlags: { flag_key: string; is_enabled: boolean; description?: string }[] = [];
    for (const f of flags) {
      const normalizedKey = normalizeFlagKey(f.flag_key);
      if (isKnownFeatureKey(normalizedKey)) {
        liveOverrides[normalizedKey] = f.is_enabled;
      } else {
        customFlags.push(f);
      }
    }

    try {
      if (Object.keys(liveOverrides).length > 0) {
        await updateSiteFeatures(dbSiteId, liveOverrides, () =>
          getPrivilegedSupabaseClient("admin-feature-flags-site-bulk-update"),
        );
      }

      const results =
        customFlags.length > 0
          ? await bulkUpsertFeatureFlags(dbSiteId, customFlags, () =>
              getPrivilegedSupabaseClient("admin-feature-flags-bulk"),
            )
          : [];

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? "admin",
        action: "bulk_update_feature_flags",
        entity_type: "feature_flag",
        entity_id: dbSiteId,
        details: {
          flags_count: flags.length,
          live_count: Object.keys(liveOverrides).length,
          custom_count: customFlags.length,
        },
      });

      return NextResponse.json({ flags: results });
    } catch (err) {
      captureException(err, { context: "[api/admin/feature-flags] PATCH failed:" });
      return NextResponse.json({ error: "Failed to bulk upsert feature flags" }, { status: 500 });
    }
  },
);

/** DELETE /api/admin/feature-flags?flag_key=<key> — delete a custom flag for the active site */
// FIX-28 (F-009): Migrate from requireAdmin + role check to withAuthz
export const DELETE = withAuthz(
  "feature-flags",
  "delete",
  async (request, { session, siteId: dbSiteId }) => {
    // F2/F3/F7: this handler reads/writes the global `sites` registry, so require super_admin.
    const roleError = assertRole(session, "super_admin");
    if (roleError) return roleError;

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
    if (flagKey.length > 128 || !/^[a-z0-9_.-]+$/i.test(flagKey)) {
      return NextResponse.json({ error: "Invalid flag_key format" }, { status: 400 });
    }

    // Live features are intrinsic to the site and toggled, not deleted.
    if (isKnownFeatureKey(flagKey)) {
      return NextResponse.json(
        { error: "Live feature flags can't be deleted — toggle them off instead." },
        { status: 400 },
      );
    }

    try {
      await deleteFeatureFlag(dbSiteId, flagKey, () =>
        getPrivilegedSupabaseClient("admin-feature-flags-delete"),
      );

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
