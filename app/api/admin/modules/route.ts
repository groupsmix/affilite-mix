import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listSiteModules, upsertSiteModule, bulkUpsertSiteModules } from "@/lib/dal/modules";
import { recordAuditEvent } from "@/lib/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";
import { MODULE_REGISTRY } from "@/lib/module-registry";

const ADMIN_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

async function enforceRateLimit(email: string | undefined, userId: string | undefined) {
  const key = `admin:${email ?? userId ?? "unknown"}`;
  const rl = await checkRateLimit(key, ADMIN_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }
  return null;
}

/** GET /api/admin/modules?site_id=<uuid> — list modules for a site */
export async function GET(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const siteId = request.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id is required" }, { status: 400 });
  }

  try {
    const siteModules = await listSiteModules(siteId);

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
    const message = err instanceof Error ? err.message : "Failed to list modules";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/modules — upsert a module for a site */
export async function POST(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
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

  // Validate module_key against registry
  const validKeys = MODULE_REGISTRY.map((m) => m.key);
  if (!validKeys.includes(module_key)) {
    return NextResponse.json(
      { error: `Invalid module_key: ${module_key}. Valid keys: ${validKeys.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const mod = await upsertSiteModule({
      site_id,
      module_key,
      is_enabled,
      config: (body.config as Record<string, unknown>) ?? {},
    });

    void recordAuditEvent({
      site_id,
      actor: session.email ?? "admin",
      action: is_enabled ? "enable_module" : "disable_module",
      entity_type: "module",
      entity_id: module_key,
      details: { module_key, is_enabled },
    });

    return NextResponse.json(mod, { status: 200 });
  } catch (err) {
    captureException(err, { context: "[api/admin/modules] POST failed:" });
    const message = err instanceof Error ? err.message : "Failed to upsert module";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/admin/modules — bulk upsert modules for a site */
export async function PATCH(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;
  const body = bodyOrError;

  const { site_id, modules } = body as {
    site_id?: string;
    modules?: { module_key: string; is_enabled: boolean; config?: Record<string, unknown> }[];
  };

  if (!site_id || !modules || !Array.isArray(modules)) {
    return NextResponse.json({ error: "site_id and modules array are required" }, { status: 400 });
  }

  try {
    const results = await bulkUpsertSiteModules(site_id, modules);

    void recordAuditEvent({
      site_id,
      actor: session.email ?? "admin",
      action: "bulk_update_modules",
      entity_type: "module",
      entity_id: site_id,
      details: { modules_count: modules.length },
    });

    return NextResponse.json({ modules: results });
  } catch (err) {
    captureException(err, { context: "[api/admin/modules] PATCH failed:" });
    const message = err instanceof Error ? err.message : "Failed to bulk upsert modules";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
