/**
 * Data Access Layer — Site Modules
 *
 * CRUD operations for per-site module enablement.
 * Modules are defined in lib/module-registry.ts; this DAL manages
 * which modules are enabled for each site in the database.
 */

import { getTenantClient } from "@/lib/supabase-server";
import type { SiteModuleRow } from "@/types/database";
import { assertRows, assertRow } from "./type-guards";

const TABLE = "site_modules";

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

/** List all module records for a site */
export async function listSiteModules(siteId: string): Promise<SiteModuleRow[]> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .order("module_key", { ascending: true });

  if (error) throw error;
  return assertRows<SiteModuleRow>(data);
}

/** List only enabled modules for a site */
export async function listEnabledModules(siteId: string): Promise<SiteModuleRow[]> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .eq("site_id", siteId)
    .eq("is_enabled", true)
    .order("module_key", { ascending: true });

  if (error) throw error;
  return assertRows<SiteModuleRow>(data);
}

/** Check if a specific module is enabled for a site */
export async function isModuleEnabled(siteId: string, moduleKey: string): Promise<boolean> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .select("is_enabled")
    .eq("site_id", siteId)
    .eq("module_key", moduleKey)
    .single();

  if (error && error.code === "PGRST116") return false; // not found
  if (error) throw error;
  return (data as { is_enabled: boolean } | null)?.is_enabled ?? false;
}

/* ------------------------------------------------------------------ */
/*  Write operations                                                   */
/* ------------------------------------------------------------------ */

/** Upsert a module record for a site (enable/disable + config) */
export async function upsertSiteModule(input: {
  site_id: string;
  module_key: string;
  is_enabled: boolean;
  config?: Record<string, unknown>;
}): Promise<SiteModuleRow> {
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from(TABLE)
    .upsert(
      {
        site_id: input.site_id,
        module_key: input.module_key,
        is_enabled: input.is_enabled,
        config: input.config ?? {},
      },
      { onConflict: "site_id,module_key" },
    )
    .select()
    .single();

  if (error) throw error;
  return assertRow<SiteModuleRow>(data, "SiteModule");
}

/** Bulk-upsert modules for a site (used during site creation) */
export async function bulkUpsertSiteModules(
  siteId: string,
  modules: { module_key: string; is_enabled: boolean; config?: Record<string, unknown> }[],
): Promise<SiteModuleRow[]> {
  if (modules.length === 0) return [];

  const sb = await getTenantClient();
  const rows = modules.map((m) => ({
    site_id: siteId,
    module_key: m.module_key,
    is_enabled: m.is_enabled,
    config: m.config ?? {},
  }));

  const { data, error } = await sb
    .from(TABLE)
    .upsert(rows, { onConflict: "site_id,module_key" })
    .select();

  if (error) throw error;
  return assertRows<SiteModuleRow>(data);
}

/** Delete a module record for a site */
export async function deleteSiteModule(siteId: string, moduleKey: string): Promise<void> {
  const sb = await getTenantClient();
  const { error } = await sb.from(TABLE).delete().eq("site_id", siteId).eq("module_key", moduleKey);

  if (error) throw error;
}
