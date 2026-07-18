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
import { logger } from "@/lib/logger";
import { getCircuitBreaker, CircuitOpenError } from "@/lib/ai/circuit-breaker";
import { emitMetric } from "@/lib/metrics";

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
 *
 * F-25: Emit a structured metric with caller dimension for alerting
 * on anomalous privileged client usage patterns.
 */
const seenCallers = new Set<string>();
function logPrivilegedUsage(caller: string): void {
  if (!seenCallers.has(caller)) {
    seenCallers.add(caller);
    logger.info(`Privileged Supabase client used by ${caller}`, {
      metric: "privileged_client_usage",
      caller,
    });
    // F-25: Emit structured metric with caller dimension for alerting
    emitMetric("privileged_client_usage_total", 1, { caller });
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
// C-7: Tightened from 5 min to 60s so a rotated service-role key
// propagates within one minute instead of five.
const PRIVILEGED_CLIENT_TTL_MS = 60 * 1000;

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

  // A98-16: Circuit breaker for privileged Supabase client — prevents
  // cascading failures when Supabase is degraded.
  const privBreaker = getCircuitBreaker("supabase-privileged", {
    failureThreshold: 3,
    recoveryTimeoutMs: 15_000,
  });

  const rawClient = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (input, init) => {
        try {
          return await privBreaker.execute(() =>
            fetchWithTimeout(input as string, {
              ...init,
              timeoutMs: 12000,
              // The privileged client bypasses RLS and is used for admin /
              // cross-tenant operations; stale fetch-cache entries would make
              // the dashboard show empty tables after writes, so always fetch
              // fresh data.
              cache: "no-store",
            }),
          );
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            logger.warn("[getPrivilegedSupabaseClient] circuit breaker OPEN — fast-failing", {
              breaker: privBreaker.metrics(),
            });
          }
          throw error;
        }
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
      // PR-10: one documented cast to the minimal intercepted shape; the
      // supabase-js generics can't cross the Proxy boundary. Used only by the
      // `from`/`rpc` interceptors below — the default path keeps the real `t`.
      const client = t as unknown as InterceptableClient;
      if (p === "from") {
        return (table: string) => wrapTable(client.from(table));
      }
      // NEW-03: Intercept `.rpc()` so every RPC call is forced through
      // `wrapRpc`, which enforces a `p_site_id` parameter (or an explicit
      // `.unsafeNoSiteFilter()` opt-out) before the query is awaited.
      if (p === "rpc") {
        return (fn: string, args?: Record<string, unknown>, options?: unknown) => {
          const rawResult = options
            ? client.rpc(fn, args, options)
            : args
              ? client.rpc(fn, args)
              : client.rpc(fn);
          return wrapRpc(rawResult, fn, args);
        };
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
 * Finding-16: Type aliases for the Proxy-based query builder wrapper.
 *
 * The PostgREST builder is a complex generic type whose shape cannot be
 * statically expressed through a Proxy without re-implementing the entire
 * supabase-js type system.  We use explicit type aliases instead of bare
 * `any` so that (a) grep for `: any` surfaces only the truly unavoidable
 * sites, and (b) future maintainers can progressively narrow these as
 * supabase-js exposes narrower builder types.
 */
type QueryBuilder = Record<string, unknown>;
type BuilderMethod = (...args: unknown[]) => unknown;

/**
 * PR-10 (FR-004): The supabase-js client methods intercepted by the Proxy,
 * narrowed to the minimal call signatures the wrapper actually invokes. The
 * upstream PostgREST generics cannot survive the Proxy boundary, so we model
 * just the shape we call here and isolate the single load-bearing cast in
 * `getPrivilegedSupabaseClient` instead of scattering inline casts on every
 * `t.from(...)` / `t.rpc(...)` call.
 */
interface InterceptableClient {
  from(name: string): QueryBuilder;
  rpc(fn: string, args?: unknown, options?: unknown): QueryBuilder;
}
interface SiteFilterState {
  siteFilterApplied: boolean;
  lastTerminal: string;
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
 * Acceptable patterns (all require a non-empty string value for site_id):
 *   client.from(t).select('*').eq('site_id', id)
 *   client.from(t).select('*').in('site_id', [id1, id2])
 *   client.from(t).select('*').match({ site_id: id })
 *   client.from(t).insert({ site_id: id, ... })
 *   client.from(t).update({...}).eq('site_id', id)
 *   client.from(t).delete().eq('site_id', id)
 *   client.from(t).upsert({ site_id: id, ... })
 *   client.from(t).select('*').unsafeNoSiteFilter() // explicit opt-out
 *
 * Passing a falsy / empty value (e.g. `.eq('site_id', undefined)` or an
 * insert payload whose `site_id` is `null`) does NOT satisfy the guard:
 * the awaited query will reject with the F-API-01 error. This blocks an
 * entire class of accidental cross-tenant queries that bind a missing
 * variable but still type-check.
 */

/** A value is acceptable as a `site_id` filter / column value when it is
 * a non-empty string. UUIDs, slugs, and synthetic ids all satisfy this;
 * `null`, `undefined`, empty strings, numbers and objects do not. */
function isUsableSiteIdValue(val: unknown): val is string {
  return typeof val === "string" && val.length > 0;
}

function wrapTable(builder: QueryBuilder): QueryBuilder {
  const state: SiteFilterState = { siteFilterApplied: false, lastTerminal: "<query>" };
  return wrapBuilder(builder, state);
}

const PASSTHROUGH_TERMINALS = ["select", "insert", "update", "delete", "upsert"] as const;

function wrapBuilder(builder: QueryBuilder, state: SiteFilterState): QueryBuilder {
  const handler: ProxyHandler<QueryBuilder> = {
    get(t, p) {
      // Tenant filter: `.eq('site_id', …)` satisfies the guard only when
      // the value is a non-empty string. `.eq('site_id', undefined)` is
      // a common bug pattern that previously silently satisfied the guard.
      if (p === "eq") {
        return (col: string, val: unknown) => {
          if (col === "site_id" && isUsableSiteIdValue(val)) {
            state.siteFilterApplied = true;
          }
          return wrapBuilder((t.eq as (c: string, v: unknown) => QueryBuilder)(col, val), state);
        };
      }
      // Tenant filter: `.in('site_id', […])` satisfies the guard when the
      // array is non-empty and every element is a non-empty string. An
      // empty array would degenerate to no filter at all (PostgREST keeps
      // every row), so we must NOT mark the filter as applied for it.
      if (p === "in") {
        return (col: string, vals: unknown) => {
          if (
            col === "site_id" &&
            Array.isArray(vals) &&
            vals.length > 0 &&
            vals.every(isUsableSiteIdValue)
          ) {
            state.siteFilterApplied = true;
          }
          return wrapBuilder((t.in as (c: string, v: unknown) => QueryBuilder)(col, vals), state);
        };
      }
      // Tenant filter: `.match({ site_id: … })` satisfies the guard when
      // the object literal includes a non-empty `site_id` string value.
      if (p === "match") {
        return (query: unknown) => {
          if (
            query !== null &&
            typeof query === "object" &&
            "site_id" in query &&
            isUsableSiteIdValue((query as Record<string, unknown>).site_id)
          ) {
            state.siteFilterApplied = true;
          }
          return wrapBuilder((t.match as (q: unknown) => QueryBuilder)(query), state);
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
        return (
          resolve: ((value: unknown) => unknown) | null,
          reject: ((reason: unknown) => unknown) | null,
        ) => {
          if (!state.siteFilterApplied) {
            const err = new Error(
              `[F-API-01] Privileged ${state.lastTerminal} executed without .eq('site_id', …) or .unsafeNoSiteFilter() opt-out.`,
            );
            if (typeof reject === "function") return reject(err);
            return Promise.reject(err);
          }
          return (
            orig as (
              resolve: ((value: unknown) => unknown) | null,
              reject: ((reason: unknown) => unknown) | null,
            ) => unknown
          ).call(t, resolve, reject);
        };
      }

      const v = t[p as string];
      if (typeof v === "function") {
        // Mutation starters: track the method name and, for insert/upsert,
        // accept `site_id` embedded in the payload as filter satisfaction.
        if ((PASSTHROUGH_TERMINALS as readonly string[]).includes(String(p))) {
          state.lastTerminal = String(p);
          if (String(p) === "insert" || String(p) === "upsert") {
            return (...args: unknown[]) => {
              const payload = args[0];
              const items = Array.isArray(payload) ? payload : [payload];
              // The previous check only confirmed that every row carried a
              // `site_id` key. A row with `{ site_id: null }` or
              // `{ site_id: undefined }` would pass — the database would
              // then either reject the write or, worse, silently coerce.
              // Require every value to be a non-empty string.
              if (
                items.length > 0 &&
                items.every(
                  (it: unknown) =>
                    it !== null &&
                    typeof it === "object" &&
                    "site_id" in it &&
                    isUsableSiteIdValue((it as Record<string, unknown>).site_id),
                )
              ) {
                state.siteFilterApplied = true;
              }
              return wrapBuilder((v as BuilderMethod).apply(t, args) as QueryBuilder, state);
            };
          }
          return (...args: unknown[]) =>
            wrapBuilder((v as BuilderMethod).apply(t, args) as QueryBuilder, state);
        }

        // Any other builder method (filter, order, limit, single, …) — keep
        // the chain wrapped so we can still observe the eventual `then`.
        return (...args: unknown[]) =>
          wrapBuilder((v as BuilderMethod).apply(t, args) as QueryBuilder, state);
      }
      return v;
    },
  };

  return new Proxy(builder, handler);
}

/**
 * NEW-03: Proxy wrapper for RPC calls to enforce tenant isolation.
 *
 * Mirrors `wrapTable` / `wrapBuilder` but for `.rpc()` results. The RPC
 * is considered tenant-scoped when the args object contains a `p_site_id`
 * key whose value is a non-empty string. RPCs that are intentionally
 * cross-tenant (e.g. `db_now`, `purge_retention`) must call
 * `.unsafeNoSiteFilter()` on the returned builder before awaiting.
 */
function wrapRpc(
  builder: QueryBuilder,
  fnName: string,
  args?: Record<string, unknown>,
): QueryBuilder {
  const hasSiteId =
    args !== undefined &&
    args !== null &&
    "p_site_id" in args &&
    isUsableSiteIdValue(args.p_site_id);
  const state: SiteFilterState = {
    siteFilterApplied: hasSiteId,
    lastTerminal: `rpc(${fnName})`,
  };
  return wrapBuilder(builder, state);
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
