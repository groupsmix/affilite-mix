import { NextResponse } from "next/server";
import { withAuthz } from "@/lib/authz";
import {
  listIntegrationProviders,
  listSiteIntegrations,
  upsertSiteIntegration,
  deleteSiteIntegration,
} from "@/lib/dal/integrations";
import { recordAuditEvent } from "@/lib/audit-log";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { captureException } from "@/lib/sentry";
import { parseJsonBody } from "@/lib/api-error";

/** GET /api/admin/integrations?site_id=<uuid> — list integrations for a site */
// FIX-32 (F-009): Migrate from requireAdmin + role check to withAuthz
export const GET = withAuthz("integrations", "read", async (request, { session }) => {
  const rlError = await enforceAdminRateLimit("integrations", session);
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
});

/** POST /api/admin/integrations — upsert a site integration */
// FIX-32 (F-009): Migrate from requireAdmin + role check to withAuthz
export const POST = withAuthz("integrations", "configure", async (request, { session }) => {
  const rlError = await enforceAdminRateLimit("integrations", session);
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
});

/** DELETE /api/admin/integrations?site_id=<uuid>&provider_key=<key> — remove integration */
// FIX-32 (F-009): Migrate from requireAdmin + role check to withAuthz
export const DELETE = withAuthz("integrations", "delete", async (request, { session }) => {
  const rlError = await enforceAdminRateLimit("integrations", session);
  if (rlError) return rlError;

  const siteId = request.nextUrl.searchParams.get("site_id");
  const providerKey = request.nextUrl.searchParams.get("provider_key");

  if (!siteId || !providerKey) {
    return NextResponse.json({ error: "site_id and provider_key are required" }, { status: 400 });
  }

  try {
    await deleteSiteIntegration(siteId, providerKey);

    // S0-FP-002: await audit for destructive actions so the trail is durable.
    await recordAuditEvent({
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
});
