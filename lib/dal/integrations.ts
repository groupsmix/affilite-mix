/**
 * Data Access Layer — Integration Providers & Site Integrations
 *
 * Manages the integration adapter layer: a registry of available
 * integration providers and per-site integration instances.
 */

import type { IntegrationProviderRow, SiteIntegrationRow } from "@/types/database";
import { assertRows, assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const PROVIDER_COLUMNS =
  "id, key, name, description, category, config_schema, is_builtin, created_at" as const;
const SITE_INTEGRATION_COLUMNS =
  "id, site_id, provider_key, is_enabled, config, created_at, updated_at" as const;

/* ------------------------------------------------------------------ */
/*  Integration Providers                                              */
/* ------------------------------------------------------------------ */

/** List all integration providers */
export async function listIntegrationProviders(
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<IntegrationProviderRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("integration_providers")
    .select(PROVIDER_COLUMNS)
    // SAFE: `integration_providers` is a global registry with no `site_id`; privileged admin read (no-op on tenant).
    .unsafeNoSiteFilter()
    .order("category", { ascending: true });

  if (error) throw error;
  return assertRows<IntegrationProviderRow>(data);
}

/* ------------------------------------------------------------------ */
/*  Site Integrations                                                  */
/* ------------------------------------------------------------------ */

/** List all integrations for a site */
export async function listSiteIntegrations(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteIntegrationRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("site_integrations")
    .select(SITE_INTEGRATION_COLUMNS)
    .eq("site_id", siteId)
    .order("provider_key", { ascending: true });

  if (error) throw error;
  return assertRows<SiteIntegrationRow>(data);
}

/** Upsert a site integration (enable/disable + config) */
export async function upsertSiteIntegration(
  input: {
    site_id: string;
    provider_key: string;
    is_enabled: boolean;
    config?: Record<string, unknown>;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteIntegrationRow> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("site_integrations")
    .upsert(
      {
        site_id: input.site_id,
        provider_key: input.provider_key,
        is_enabled: input.is_enabled,
        config: input.config ?? {},
      },
      { onConflict: "site_id,provider_key" },
    )
    .select()
    .single();

  if (error) throw error;
  return assertRow<SiteIntegrationRow>(data, "SiteIntegration");
}

/** Delete a site integration */
export async function deleteSiteIntegration(
  siteId: string,
  providerKey: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<void> {
  const sb = await getClient();
  const { error } = await sb
    .from("site_integrations")
    .delete()
    .eq("site_id", siteId)
    .eq("provider_key", providerKey);

  if (error) throw error;
}
