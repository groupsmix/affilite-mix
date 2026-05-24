/**
 * A100-08: Defensive tenant-scoped wrapper for cron DB queries.
 *
 * Cron jobs use the service-role key which bypasses RLS. A bug could
 * accidentally leak or modify data across tenants. This wrapper provides
 * a query builder that automatically appends site_id filtering.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

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
    from<T extends keyof Database["public"]["Tables"]>(table: T) {
      return client.from(table).select().eq("site_id" as any, siteId);
    },

    /** Select with custom columns */
    select<T extends keyof Database["public"]["Tables"]>(table: T, columns: string) {
      return client.from(table).select(columns).eq("site_id" as any, siteId);
    },

    /** Update with forced site_id scope */
    update<T extends keyof Database["public"]["Tables"]>(
      table: T,
      values: Record<string, unknown>,
    ) {
      return client.from(table).update(values as any).eq("site_id" as any, siteId);
    },

    /** Delete with forced site_id scope */
    delete<T extends keyof Database["public"]["Tables"]>(table: T) {
      return client.from(table).delete().eq("site_id" as any, siteId);
    },

    /** The raw site_id for manual queries that need it */
    siteId,
  };
}
