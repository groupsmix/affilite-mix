/**
 * Data Access Layer — Integration Providers & Site Integrations
 *
 * Manages the integration adapter layer: a registry of available
 * integration providers and per-site integration instances.
 */

import { getServiceClient } from "@/lib/supabase-server";
import type { IntegrationProviderRow, SiteIntegrationRow } from "@/types/database";
import { assertRows, assertRow, rowOrNull } from "./type-guards";

/* ------------------------------------------------------------------ */
/*  Integration Providers                                              */
/* ------------------------------------------------------------------ */

/** List all integration providers */
export async function listIntegrationProviders(): Promise<IntegrationProviderRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("integration_providers")
    .select("*")
    .order("category", { ascending: true });

  if (error) throw error;
  return assertRows<IntegrationProviderRow>(data);
}

/** List integration providers by category */
export async function listProvidersByCategory(category: string): Promise<IntegrationProviderRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("integration_providers")
    .select("*")
    .eq("category", category)
    .order("name", { ascending: true });

  if (error) throw error;
  return assertRows<IntegrationProviderRow>(data);
}

/** Get a provider by key */
export async function getProviderByKey(key: string): Promise<IntegrationProviderRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("integration_providers")
    .select("*")
    .eq("key", key)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<IntegrationProviderRow>(data);
}

/* ------------------------------------------------------------------ */
/*  Site Integrations                                                  */
/* ------------------------------------------------------------------ */

/** List all integrations for a site */
export async function listSiteIntegrations(siteId: string): Promise<SiteIntegrationRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("site_integrations")
    .select("*")
    .eq("site_id", siteId)
    .order("provider_key", { ascending: true });

  if (error) throw error;
  return assertRows<SiteIntegrationRow>(data);
}

/** List only enabled integrations for a site */
export async function listEnabledIntegrations(siteId: string): Promise<SiteIntegrationRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("site_integrations")
    .select("*")
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
): Promise<SiteIntegrationRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("site_integrations")
    .select("*")
    .eq("site_id", siteId)
    .eq("provider_key", providerKey)
    .single();

  if (error && error.code !== "PGRST116") throw error;
  return rowOrNull<SiteIntegrationRow>(data);
}

/** Upsert a site integration (enable/disable + config) */
export async function upsertSiteIntegration(input: {
  site_id: string;
  provider_key: string;
  is_enabled: boolean;
  config?: Record<string, unknown>;
}): Promise<SiteIntegrationRow> {
  const sb = getServiceClient();
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
): Promise<SiteIntegrationRow[]> {
  if (integrations.length === 0) return [];

  const sb = getServiceClient();
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
export async function deleteSiteIntegration(siteId: string, providerKey: string): Promise<void> {
  const sb = getServiceClient();
  const { error } = await sb
    .from("site_integrations")
    .delete()
    .eq("site_id", siteId)
    .eq("provider_key", providerKey);

  if (error) throw error;
}
