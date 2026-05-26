/**
 * Data Access Layer — Integration Providers & Site Integrations
 *
 * Manages the integration adapter layer: a registry of available
 * integration providers and per-site integration instances.
 */

import type { IntegrationProviderRow, SiteIntegrationRow } from "@/types/database";
import { assertRows, assertRow, rowOrNull } from "./type-guards";
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
    .order("category", { ascending: true });

  if (error) throw error;
  return assertRows<IntegrationProviderRow>(data);
}

/** List integration providers by category */
export async function listProvidersByCategory(
  category: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<IntegrationProviderRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("integration_providers")
    .select(PROVIDER_COLUMNS)
    .eq("category", category)
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<IntegrationProviderRow>(data);
}

/** Get a provider by key */
export async function getProviderByKey(
  key: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<IntegrationProviderRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("integration_providers")
    .select(PROVIDER_COLUMNS)
    .eq("key", key)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<IntegrationProviderRow>(data);
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

/** List only enabled integrations for a site */
export async function listEnabledIntegrations(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteIntegrationRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("site_integrations")
    .select(SITE_INTEGRATION_COLUMNS)
    .eq("site_id", siteId)
    .eq("is_enabled", true)
    .order("provider_key", { ascending: true });

  if (error) throw error;
  return assertRows<SiteIntegrationRow>(data);
}

/** Get a specific site integration */
export async function getSiteIntegration(
  siteId: string,
  providerKey: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteIntegrationRow | null> {
  const sb = await getClient();
  const { data, error } = await sb
    .from("site_integrations")
    .select(SITE_INTEGRATION_COLUMNS)
    .eq("site_id", siteId)
    .eq("provider_key", providerKey)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SiteIntegrationRow>(data);
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

/** Bulk-upsert integrations for a site (used during site creation) */
export async function bulkUpsertSiteIntegrations(
  siteId: string,
  integrations: { provider_key: string; is_enabled: boolean; config?: Record<string, unknown> }[],
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteIntegrationRow[]> {
  if (integrations.length === 0) return [];

  const sb = await getClient();
  const rows = integrations.map((i) => ({
    site_id: siteId,
    provider_key: i.provider_key,
    is_enabled: i.is_enabled,
    config: i.config ?? {},
  }));

  const { data, error } = await sb
    .from("site_integrations")
    .upsert(rows, { onConflict: "site_id,provider_key" })
    .select();

  if (error) throw error;
  return assertRows<SiteIntegrationRow>(data);
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
