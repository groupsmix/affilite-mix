import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import {
  listIntegrationProviders,
  listSiteIntegrations,
  upsertSiteIntegration,
  deleteSiteIntegration,
} from "@/lib/dal/integrations";
import { recordAuditEvent } from "@/lib/audit-log";
import { checkRateLimit } from "@/lib/rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

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

/** GET /api/admin/integrations?site_id=<uuid> — list integrations for a site */
export async function GET(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const siteId = request.nextUrl.searchParams.get("site_id");

  try {
    const providers = await listIntegrationProviders();

    if (siteId) {
      const siteIntegrations = await listSiteIntegrations(siteId);

      // Merge providers with site-specific enablement/config
      const merged = providers.map((provider) => {
        const siteInteg = siteIntegrations.find((si) => si.provider_key === provider.key);
        return {
          ...provider,
          is_enabled: siteInteg?.is_enabled ?? false,
          site_config: siteInteg?.config ?? {},
          site_integration_id: siteInteg?.id ?? null,
        };
      });

      return NextResponse.json({ integrations: merged, providers });
    }

    // No site_id: return just the provider registry
    return NextResponse.json({ providers });
  } catch (err) {
    captureException(err, { context: "[api/admin/integrations] GET failed:" });
    const message = err instanceof Error ? err.message : "Failed to list integrations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/admin/integrations — upsert a site integration */
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

  const { site_id, provider_key, is_enabled } = body as {
    site_id?: string;
    provider_key?: string;
    is_enabled?: boolean;
  };

  if (!site_id || !provider_key || is_enabled === undefined) {
    return NextResponse.json(
      { error: "site_id, provider_key, and is_enabled are required" },
      { status: 400 },
    );
  }

  try {
    const integration = await upsertSiteIntegration({
      site_id,
      provider_key,
      is_enabled,
      config: (body.config as Record<string, unknown>) ?? {},
    });

    void recordAuditEvent({
      site_id,
      actor: session.email ?? "admin",
      action: is_enabled ? "enable_integration" : "disable_integration",
      entity_type: "integration",
      entity_id: provider_key,
      details: { provider_key, is_enabled },
    });

    return NextResponse.json(integration, { status: 200 });
  } catch (err) {
    captureException(err, { context: "[api/admin/integrations] POST failed:" });
    const message = err instanceof Error ? err.message : "Failed to upsert integration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE /api/admin/integrations?site_id=<uuid>&provider_key=<key> — remove integration */
export async function DELETE(request: NextRequest) {
  const { error, session } = await requireAdmin();
  if (error) return error;

  if (session.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden: super_admin role required" }, { status: 403 });
  }

  const rlError = await enforceRateLimit(session.email, session.userId);
  if (rlError) return rlError;

  const siteId = request.nextUrl.searchParams.get("site_id");
  const providerKey = request.nextUrl.searchParams.get("provider_key");

  if (!siteId || !providerKey) {
    return NextResponse.json({ error: "site_id and provider_key are required" }, { status: 400 });
  }

  try {
    await deleteSiteIntegration(siteId, providerKey);

    void recordAuditEvent({
      site_id: siteId,
      actor: session.email ?? "admin",
      action: "delete_integration",
      entity_type: "integration",
      entity_id: providerKey,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/admin/integrations] DELETE failed:" });
    const message = err instanceof Error ? err.message : "Failed to delete integration";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
