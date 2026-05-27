/**
 * Type augmentation for the F-API-01 site_id enforcement Proxy.
 *
 * The privileged Supabase client (from `getPrivilegedSupabaseClient`) wraps
 * every PostgREST query builder in a Proxy that requires either
 * `.eq('site_id', ...)` or an explicit `.unsafeNoSiteFilter()` opt-out
 * before the query can be awaited.
 *
 * This declaration merges `unsafeNoSiteFilter()` into the PostgREST builder
 * types so TypeScript recognizes the method without requiring `as any` casts
 * at every call site.
 */

import "@supabase/postgrest-js";

declare module "@supabase/postgrest-js" {
  interface PostgrestFilterBuilder<
    Schema,
    Row extends Record<string, unknown>,
    Result,
    RelationName,
    Relationships,
  > {
    /**
     * F-API-01: Opt out of the mandatory `site_id` filter on this query.
     * Use only for global/platform-level tables that do not carry tenant context
     * (e.g. `admin_users`, `sites`, `webhook_dlq`, `stripe_events`).
     */
    unsafeNoSiteFilter(): this;
  }
}
