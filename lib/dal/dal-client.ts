/**
 * A-01: DAL client resolver — allows DAL functions to accept an explicit
 * Supabase client instead of always calling getTenantClient().
 *
 * Problem: cron/queue/webhook handlers have no x-site-id header, so
 * getTenantClient() mints a JWT with no site_id claim and the
 * tenant_isolation RLS policy rejects writes. Those callers already
 * use the privileged client (bypasses RLS) and gate access via
 * CRON_SECRET / INTERNAL_API_TOKEN.
 *
 * Solution: DAL functions that may be called from non-request contexts
 * accept an optional `getClient` callback. The default is getTenantClient
 * (for normal request-scoped calls). Cron/queue/webhook callers pass
 * getPrivilegedSupabaseClient instead.
 *
 * Usage in DAL:
 *   export async function myDalFn(
 *     siteId: string,
 *     opts?: { getClient?: DalClientGetter },
 *   ) {
 *     const sb = await (opts?.getClient ?? getTenantClient)();
 *     ...
 *   }
 *
 * Usage in cron:
 *   import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
 *   myDalFn(siteId, { getClient: getPrivilegedSupabaseClient });
 *
 * F-11: AbortSignal Support (Future Implementation)
 *
 * Current state: DAL calls do not honour AbortSignal. When a request
 * is cancelled (e.g., user navigates away, timeout), the underlying
 * Supabase HTTP request continues to execute, wasting resources and
 * potentially causing race conditions.
 *
 * Required changes:
 * 1. Update DalClientGetter to accept optional AbortSignal parameter
 * 2. Pass signal to Supabase client fetch options
 * 3. Emit post-timeout metric when AbortSignal triggers
 * 4. Update all DAL functions to accept and forward signal parameter
 *
 * Example implementation:
 *   export type DalClientGetter = (signal?: AbortSignal) => Promise<DalClient> | DalClient;
 *
 *   export const defaultDalClientGetter: DalClientGetter = (signal?: AbortSignal) => {
 *     const client = getTenantClient();
 *     if (signal) {
 *       // Configure client to honour the signal
 *       // This requires modifying the Supabase client initialization
 *     }
 *     return client;
 *   };
 *
 * Post-timeout metric:
 *   When AbortSignal.aborted is true, emit:
 *   emitMetric("dal_post_timeout_total", 1, { operation: "table_name" });
 *
 * This is tracked as a future improvement due to the scope of changes
 * required across all DAL functions.
 */

import { getTenantClient } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * FIX-04 (F-001): Branded SiteId type.
 *
 * A plain `string` can be any user input. A `SiteId` can only come from
 * a verified source (middleware x-site-id header, admin session, or DB
 * lookup). This makes it a type error to pass an unvalidated string to
 * a DAL function that uses the privileged client.
 *
 * Cast with: `someString as SiteId` (only after validation).
 * Brand is nominal — `string & { __brand: "SiteId" }` is not assignable
 * from a bare `string` without an explicit cast.
 */
export type SiteId = string & { readonly __brand: unique symbol };

/** Type returned by both getTenantClient() and getPrivilegedSupabaseClient(). */
type DalClient = SupabaseClient;
/** A zero-arg async function that returns a Supabase client. */
export type DalClientGetter = () => Promise<DalClient> | DalClient;

/** The default client getter — getTenantClient (request-scoped, RLS-enforced). */
export const defaultDalClientGetter: DalClientGetter = () => getTenantClient();
