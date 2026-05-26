// Privileged Supabase gateway — the ONLY approved path for service-role access.
//
// `import "server-only"` (handled by Next.js at compile time) makes any
// accidental import from a client component a build-time error, so the
// service-role key cannot be shipped to the browser even by mistake.
//
// Service-role bypasses Row Level Security, so it must be treated like
// radioactive honey: only call this from server-side code that genuinely
// needs to bypass RLS (e.g. cross-tenant maintenance, webhooks signed by an
// external party, integration test seed scripts) and prefer
// `getTenantClient` / `getAnonClient` for everything else.
//
// The legacy `getServiceClient` export in `lib/supabase-server.ts` now
// delegates here, and ESLint forbids importing `getServiceClient` from any
// `**/supabase-server` path so that this file remains the only gateway.
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

// FIX-04 (F-001, F-011): Branded type for the privileged client.
// Callers receive a PrivilegedSupabaseClient instead of a plain
// SupabaseClient, making it obvious at the call site that RLS is
// bypassed. The brand is nominal-only — it does not change runtime
// behaviour, but it prevents accidental assignment to a variable
// typed as the tenant-scoped client.
declare const _privilegedBrand: unique symbol;
export type PrivilegedSupabaseClient = SupabaseClient<Database> & {
  readonly [_privilegedBrand]: true;
};

/**
 * FIX-04: Audit log for privileged client usage. Each call site is
 * logged once per isolate so operators can verify that only approved
 * callers are using the service-role key.
 */
const seenCallers = new Set<string>();
function logPrivilegedUsage(caller: string): void {
  if (!seenCallers.has(caller)) {
    seenCallers.add(caller);
    console.log(
      JSON.stringify({
        metric: "privileged_client_usage",
        caller,
        msg: `Privileged Supabase client used by ${caller}`,
      }),
    );
  }
}

/**
 * G-30: TTL cap on the per-isolate memoisation of the privileged client.
 *
 * `wrangler secret put` updates a Worker secret without forcing a redeploy,
 * so a long-running isolate that has already created a Supabase client will
 * keep using the old key indefinitely. Capping the cache at 5 minutes means
 * any isolate that survives the rotation re-reads `process.env` on the next
 * request after the TTL expires and picks up the new key without operator
 * intervention. Operators can still trigger an immediate rollout via
 * `wrangler deploy` — see docs/secrets-rotation-runbook.md.
 */
const PRIVILEGED_CLIENT_TTL_MS = 5 * 60 * 1000;

let _privilegedClient: SupabaseClient<Database> | null = null;
let _privilegedClientCreatedAt = 0;
let _cachedUrl: string | null = null;
let _cachedKey: string | null = null;

/**
 * Returns a Supabase client authenticated with `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * RLS is bypassed by this client — every caller is responsible for its own
 * site / tenant scoping (e.g. `.eq("site_id", verifiedSiteId)` on every
 * query). For request-scoped reads you almost always want
 * `getTenantClient()` from `lib/server-only/supabase.ts`, which mints a
 * scoped JWT and lets RLS act as a defence-in-depth layer.
 *
 * The client is memoised per isolate with a 5-minute TTL so that a
 * `SUPABASE_SERVICE_ROLE_KEY` rotation propagates to long-lived isolates
 * within one TTL window without requiring an explicit redeploy. The cache
 * is also invalidated immediately if the URL or key in `process.env`
 * differs from the values used to mint the cached client, so a rotation
 * combined with a `wrangler deploy` rollout takes effect on the next
 * request. The client itself does not hold mutable session state
 * (`persistSession: false`).
 */
export function getPrivilegedSupabaseClient(caller?: string): PrivilegedSupabaseClient {
  if (caller) logPrivilegedUsage(caller);

  const url = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY");

  const now = Date.now();
  const isExpired = now - _privilegedClientCreatedAt >= PRIVILEGED_CLIENT_TTL_MS;
  const envChanged = url !== _cachedUrl || key !== _cachedKey;

  if (_privilegedClient && !isExpired && !envChanged) {
    return _privilegedClient as PrivilegedSupabaseClient;
  }

  const rawClient = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (input, init) => {
        return fetchWithTimeout(input as string, {
          ...init,
          timeoutMs: 12000,
        });
      },
    },
  });

  // F-API-01: Wrap the raw client in a Proxy that intercepts `.from()` so
  // every PostgREST query builder is forced through `wrapTable`, which
  // enforces a `.eq('site_id', ...)` filter (or an explicit
  // `.unsafeNoSiteFilter()` opt-out) before the query is awaited.
  // The Proxy itself is cached so subsequent cache hits also return the
  // wrapped client — the previous implementation only returned the Proxy
  // on the cold path, which silently bypassed the guard on every cache hit.
  _privilegedClient = new Proxy(rawClient, {
    get(t, p, r) {
      if (p === "from") {
        return (table: string) => wrapTable((t.from as any)(table));
      }
      return Reflect.get(t, p, r);
    },
  }) as SupabaseClient<Database>;
  _privilegedClientCreatedAt = now;
  _cachedUrl = url;
  _cachedKey = key;

  return _privilegedClient as PrivilegedSupabaseClient;
}

/**
 * F-API-01: Proxy wrapper for PostgREST query builders to enforce
 * tenant isolation on the privileged service-role client.
 *
 * The PostgREST builder is thenable — the query only executes when the
 * caller awaits it. We therefore enforce the `site_id` requirement at the
 * `then`/awaitable boundary rather than on `select`/`insert`/`update`/
 * `delete`/`upsert`, because those methods are *starters* in the supabase-js
 * fluent API (e.g. `.from(t).select('*').eq('site_id', id)`), not terminals.
 *
 * Acceptable patterns:
 *   client.from(t).select('*').eq('site_id', id)
 *   client.from(t).insert({ site_id: id, ... })
 *   client.from(t).update({...}).eq('site_id', id)
 *   client.from(t).delete().eq('site_id', id)
 *   client.from(t).upsert({ site_id: id, ... })
 *   client.from(t).select('*').unsafeNoSiteFilter() // explicit opt-out
 */
function wrapTable(builder: any): any {
  const state = { siteFilterApplied: false, lastTerminal: "<query>" };
  return wrapBuilder(builder, state);
}

const PASSTHROUGH_TERMINALS = ["select", "insert", "update", "delete", "upsert"] as const;

function wrapBuilder(
  builder: any,
  state: { siteFilterApplied: boolean; lastTerminal: string },
): any {
  const handler: ProxyHandler<any> = {
    get(t, p) {
      // Tenant filter: any `.eq('site_id', …)` satisfies the guard.
      if (p === "eq") {
        return (col: string, val: any) => {
          if (col === "site_id") state.siteFilterApplied = true;
          return wrapBuilder(t.eq(col, val), state);
        };
      }
      // Explicit opt-out for cross-tenant operations.
      if (p === "unsafeNoSiteFilter") {
        return () => {
          state.siteFilterApplied = true;
          return wrapBuilder(t, state);
        };
      }

      // Terminal awaitable: enforce the site filter when the query is awaited.
      if (p === "then") {
        const orig = t.then;
        if (typeof orig !== "function") return orig;
        return (resolve: any, reject: any) => {
          if (!state.siteFilterApplied) {
            const err = new Error(
              `[F-API-01] Privileged ${state.lastTerminal} executed without .eq('site_id', …) or .unsafeNoSiteFilter() opt-out.`,
            );
            if (typeof reject === "function") return reject(err);
            return Promise.reject(err);
          }
          return orig.call(t, resolve, reject);
        };
      }

      const v = t[p];
      if (typeof v === "function") {
        // Mutation starters: track the method name and, for insert/upsert,
        // accept `site_id` embedded in the payload as filter satisfaction.
        if ((PASSTHROUGH_TERMINALS as readonly string[]).includes(String(p))) {
          state.lastTerminal = String(p);
          if (String(p) === "insert" || String(p) === "upsert") {
            return (...args: any[]) => {
              const payload = args[0];
              const items = Array.isArray(payload) ? payload : [payload];
              if (
                items.length > 0 &&
                items.every((it: any) => it && typeof it === "object" && "site_id" in it)
              ) {
                state.siteFilterApplied = true;
              }
              return wrapBuilder(v.apply(t, args), state);
            };
          }
          return (...args: any[]) => wrapBuilder(v.apply(t, args), state);
        }

        // Any other builder method (filter, order, limit, single, …) — keep
        // the chain wrapped so we can still observe the eventual `then`.
        return (...args: any[]) => wrapBuilder(v.apply(t, args), state);
      }
      return v;
    },
  };

  return new Proxy(builder, handler);
}

/**
 * Test helper: clear the cached privileged client so the next call to
 * `getPrivilegedSupabaseClient()` re-reads the current environment.
 *
 * Production code MUST NOT call this. It exists only so that unit tests
 * which manipulate `process.env` (or `vi.stubEnv`) between cases see the
 * new env values instead of a stale cached client.
 */
export function __resetPrivilegedSupabaseClientForTests(): void {
  _privilegedClient = null;
  _privilegedClientCreatedAt = 0;
  _cachedUrl = null;
  _cachedKey = null;
}
