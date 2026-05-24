/**
 * A100-08: Defensive tenant-scoped wrapper for cron DB queries.
 *
 * Cron jobs use the service-role key which bypasses RLS. A bug could
 * accidentally leak or modify data across tenants. This wrapper provides
 * a query builder that automatically appends site_id filtering.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

type TableName = keyof Database["public"]["Tables"] & string;

/**
 * Returns a scoped query helper that enforces site_id filtering on every query.
 * Use this in cron jobs instead of raw service-role queries to prevent
 * accidental cross-tenant data access.
 */
export function scopedCronQuery(client: SupabaseClient<Database>, siteId: string) {
  if (!siteId) {
    throw new Error("[cron-tenant-scope] siteId is required for scoped cron queries");
  }

  return {
    from(table: TableName) {
      return (client.from as any)(table).select().eq("site_id", siteId);
    },

    /** Select with custom columns */
    select(table: TableName, columns: string) {
      return (client.from as any)(table).select(columns).eq("site_id", siteId);
    },

    /** Update with forced site_id scope */
    update(table: TableName, values: Record<string, unknown>) {
      return (client.from as any)(table).update(values).eq("site_id", siteId);
    },

    /** Delete with forced site_id scope */
    delete(table: TableName) {
      return (client.from as any)(table).delete().eq("site_id", siteId);
    },

    /** The raw site_id for manual queries that need it */
    siteId,
  };
}
