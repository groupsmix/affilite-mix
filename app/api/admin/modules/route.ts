import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import { listSiteModules, upsertSiteModule, bulkUpsertSiteModules } from "@/lib/dal/modules";
// FIX: `site_modules` is RLS-restricted to service_role (migrations 00033 /
// 00040). The default tenant client (authenticated role) is denied, so these
// admin reads/writes must use the privileged gateway. The route is gated by
// withAuthz(super_admin) and every DAL call is site-scoped (.eq site_id).
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { recordAuditEvent } from "@/lib/audit-log";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { MODULE_REGISTRY } from "@/lib/module-registry";

/** GET /api/admin/modules?site_id=<uuid> — list modules for a site */
// FIX-32 (F-009): Migrate from requireAdmin + role check to withAuthz
export const GET = withAuthz("modules", "read", async (request, { session, siteId: dbSiteId }) => {
  const rlError = await enforceAdminRateLimit("modules", session);
  if (rlError) return rlError;

  // A-015: The site is server-derived from the validated active-site cookie
  // (never the caller-supplied query param). A `?site_id=` that disagrees is
  // rejected rather than trusted, closing the cross-tenant read gap (H3).
  const querySiteId = request.nextUrl.searchParams.get("site_id");
  if (!querySiteId) {
    return NextResponse.json({ error: "site_id is required" }, { status: 400 });
  }
  if (querySiteId !== dbSiteId) {
    return NextResponse.json({ error: "Forbidden: site_id mismatch" }, { status: 403 });
  }

  try {
    const siteModules = await listSiteModules(dbSiteId, () =>
      getPrivilegedSupabaseClient("admin-modules-list"),
    );

    // Merge with registry to show all available modules with their enabled status
    const merged = MODULE_REGISTRY.map((def) => {
      const siteModule = siteModules.find((m) => m.module_key === def.key);
      return {
        ...def,
        is_enabled: siteModule?.is_enabled ?? false,
        config: siteModule?.config ?? {},
        site_module_id: siteModule?.id ?? null,
      };
    });

    return NextResponse.json({ modules: merged, registry: MODULE_REGISTRY });
  } catch (err) {
    captureException(err, { context: "[api/admin/modules] GET failed:" });
    return NextResponse.json({ error: "Failed to list modules" }, { status: 500 });
  }
});

/** POST /api/admin/modules — upsert a module for a site */
// FIX-32 (F-009): Migrate from requireAdmin + role check to withAuthz
export const POST = withAuthz(
  "modules",
  "configure",
  async (request, { session, siteId: dbSiteId }) => {
    const rlError = await enforceAdminRateLimit("modules", session);
    if (rlError) return rlError;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError;

    const { site_id, module_key, is_enabled } = body as {
      site_id?: string;
      module_key?: string;
      is_enabled?: boolean;
    };

    if (!site_id || !module_key || is_enabled === undefined) {
      return NextResponse.json(
        { error: "site_id, module_key, and is_enabled are required" },
        { status: 400 },
      );
    }

    // A-015: Never trust the caller's site_id — it must match the server-derived
    // active site. The write below always uses `dbSiteId`, not the body value (H3).
    if (site_id !== dbSiteId) {
      return NextResponse.json({ error: "Forbidden: site_id mismatch" }, { status: 403 });
    }

    // Validate module_key against registry
    const validKeys = MODULE_REGISTRY.map((m) => m.key);
    if (!validKeys.includes(module_key)) {
      return NextResponse.json(
        { error: `Invalid module_key. Valid keys: ${validKeys.join(", ")}` },
        { status: 400 },
      );
    }

    try {
      const mod = await upsertSiteModule(
        {
          site_id: dbSiteId,
          module_key,
          is_enabled,
          config: (body.config as Record<string, unknown>) ?? {},
        },
        () => getPrivilegedSupabaseClient("admin-modules-upsert"),
      );

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? "admin",
        action: is_enabled ? "enable_module" : "disable_module",
        entity_type: "module",
        entity_id: module_key,
        details: { module_key, is_enabled },
      });

      return NextResponse.json(mod, { status: 200 });
    } catch (err) {
      captureException(err, { context: "[api/admin/modules] POST failed:" });
      return NextResponse.json({ error: "Failed to upsert module" }, { status: 500 });
    }
  },
);

/** PATCH /api/admin/modules — bulk upsert modules for a site */
// FIX-32 (F-009): Migrate from requireAdmin + role check to withAuthz
export const PATCH = withAuthz(
  "modules",
  "configure",
  async (request, { session, siteId: dbSiteId }) => {
    const rlError = await enforceAdminRateLimit("modules", session);
    if (rlError) return rlError;

    const bodyOrError = await parseJsonBody(request);
    if (bodyOrError instanceof NextResponse) return bodyOrError;
    const body = bodyOrError;

    const { site_id, modules } = body as {
      site_id?: string;
      modules?: { module_key: string; is_enabled: boolean; config?: Record<string, unknown> }[];
    };

    if (!site_id || !modules || !Array.isArray(modules)) {
      return NextResponse.json(
        { error: "site_id and modules array are required" },
        { status: 400 },
      );
    }

    // A-015: Never trust the caller's site_id — it must match the server-derived
    // active site. The write below always uses `dbSiteId`, not the body value (H3).
    if (site_id !== dbSiteId) {
      return NextResponse.json({ error: "Forbidden: site_id mismatch" }, { status: 403 });
    }

    try {
      const results = await bulkUpsertSiteModules(dbSiteId, modules, () =>
        getPrivilegedSupabaseClient("admin-modules-bulk"),
      );

      void recordAuditEvent({
        site_id: dbSiteId,
        actor: session.email ?? "admin",
        action: "bulk_update_modules",
        entity_type: "module",
        entity_id: dbSiteId,
        details: { modules_count: modules.length },
      });

      return NextResponse.json({ modules: results });
    } catch (err) {
      captureException(err, { context: "[api/admin/modules] PATCH failed:" });
      return NextResponse.json({ error: "Failed to bulk upsert modules" }, { status: 500 });
    }
  },
);
