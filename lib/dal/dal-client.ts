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
 */

import { getTenantClient } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Type returned by both getTenantClient() and getPrivilegedSupabaseClient(). */
export type DalClient = SupabaseClient;
/** A zero-arg async function that returns a Supabase client. */
export type DalClientGetter = () => Promise<DalClient> | DalClient;

/** The default client getter — getTenantClient (request-scoped, RLS-enforced). */
export const defaultDalClientGetter: DalClientGetter = () => getTenantClient();
