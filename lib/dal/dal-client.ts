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
export type DalClient = SupabaseClient;
/** A zero-arg async function that returns a Supabase client. */
export type DalClientGetter = () => Promise<DalClient> | DalClient;

/** The default client getter — getTenantClient (request-scoped, RLS-enforced). */
export const defaultDalClientGetter: DalClientGetter = () => getTenantClient();

/**
 * A-97 / F-001 runtime guard: asserts the privileged client is used correctly.
 * If the client is privileged, the caller MUST provide a site_id to prevent
 * cross-tenant writes via cron/queue handlers.
 */
export function assertSiteIdForPrivilegedClient(
  client: DalClient,
  siteId: string | undefined | null,
): void {
  if ((client as any)[Symbol.for("PrivilegedSupabaseClient")] || (client as any).__is_privileged) {
    if (!siteId) {
      throw new Error("[A-97] Privileged client requires an explicit siteId argument");
    }
  }
}
