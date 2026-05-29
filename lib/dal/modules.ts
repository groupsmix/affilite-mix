/**
 * Data Access Layer — Site Modules
 *
 * CRUD operations for per-site module enablement.
 * Modules are defined in lib/module-registry.ts; this DAL manages
 * which modules are enabled for each site in the database.
 */

import type { SiteModuleRow } from "@/types/database";
import { assertRows, assertRow } from "./type-guards";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

const TABLE = "site_modules";
const LIST_COLUMNS = "id, site_id, module_key, is_enabled, config, created_at, updated_at" as const;

/* ------------------------------------------------------------------ */
/*  Read operations                                                    */
/* ------------------------------------------------------------------ */

/** List all module records for a site */
export async function listSiteModules(
  siteId: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteModuleRow[]> {
  const sb = await getClient();
  const { data, error } = await sb
    .from(TABLE)
    .select(LIST_COLUMNS)
    .eq("site_id", siteId)
    .order("module_key", { ascending: true });

  if (error) throw error;
  return assertRows<SiteModuleRow>(data);
}

/* ------------------------------------------------------------------ */
/*  Write operations                                                   */
/* ------------------------------------------------------------------ */

/** Upsert a module record for a site (enable/disable + config) */
export async function upsertSiteModule(
  input: {
    site_id: string;
    module_key: string;
    is_enabled: boolean;
    config?: Record<string, unknown>;
  },
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteModuleRow> {
  const sb = await getClient();
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
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<SiteModuleRow[]> {
  if (modules.length === 0) return [];

  const sb = await getClient();
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
