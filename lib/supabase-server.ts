import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { fetchWithTimeout, type FetchWithTimeoutOptions } from "@/lib/fetch-timeout";
import { SignJWT } from "jose";
import { logger } from "@/lib/logger";
import { headers, cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { getSiteRowBySlugWithClient } from "@/lib/dal/sites";
import { timingSafeEqual } from "@/lib/internal-hmac";
import { authzPrimaryRead } from "@/lib/read-after-write";
import { getCircuitBreaker, CircuitOpenError } from "@/lib/ai/circuit-breaker";
import { allSiteTags } from "@/lib/cache-tags";
// F-1: signSiteIdFallback moved to lib/site-id-signer.ts (Edge-safe leaf)
// to avoid pulling bcryptjs + jose/deflate into the middleware bundle.
// Callers should import directly from @/lib/site-id-signer.
import { signSiteIdFallback } from "@/lib/site-id-signer";
import { PATHNAME_HEADER } from "@/lib/request-path";

/**
 * F-API-01 companion shim for the RLS-enforced clients.
 *
 * The privileged service-role client (`lib/server-only/service-role.ts`) wraps
 * every `.from()` / `.rpc()` chain in a Proxy that REQUIRES either an
 * `.eq('site_id', …)` filter or an explicit `.unsafeNoSiteFilter()` opt-out
 * before a query may be awaited. DAL helpers that operate on GLOBAL tables
 * (`admin_users`, `sites`, …) therefore call that opt-out marker on
 * whatever client they are handed.
 *
 * The tenant / anon clients enforce isolation through RLS, not that Proxy, so
 * they never carried that opt-out method. A DAL call that reached for it on
 * one of these clients threw `TypeError: … is not a function`,
 * which surfaced as a Server Component crash (the admin dashboard "Admin Error"
 * boundary on Settings / Users / platform tabs) and broke `getSiteRowBySlug`
 * on the public layouts.
 *
 * This shim adds that opt-out as a NO-OP pass-through on the
 * tenant / anon clients so those global-table DAL helpers work uniformly across
 * every client. It changes nothing else: each builder method is forwarded
 * untouched, `await query` still resolves to the PostgREST `{ data, error }`
 * result, and tenant isolation continues to be enforced by RLS exactly as
 * before.
 */
function wrapRlsBuilderWithNoopOptOut(builder: unknown): unknown {
  if (builder === null || typeof builder !== "object") return builder;
  return new Proxy(builder as Record<string | symbol, unknown>, {
    get(target, prop) {
      // No-op opt-out: RLS (not the F-API-01 Proxy) is the isolation
      // boundary for these clients, so the marker simply passes through.
      if (prop === "unsafeNoSiteFilter") {
        return () => wrapRlsBuilderWithNoopOptOut(target);
      }
      // Preserve thenable semantics so `await query` resolves to the
      // PostgREST `{ data, error }` result rather than a wrapped Proxy.
      if (prop === "then") {
        const orig = (target as { then?: unknown }).then;
        if (typeof orig !== "function") return orig;
        return (resolve: unknown, reject: unknown) =>
          (orig as (...a: unknown[]) => unknown).call(target, resolve, reject);
      }
      const value = (target as Record<string | symbol, unknown>)[prop];
      if (typeof value === "function") {
        // Keep the chain wrapped so the opt-out stays available after
        // `.select()` / `.eq()` / `.order()` / … .
        return (...args: unknown[]) =>
          wrapRlsBuilderWithNoopOptOut((value as (...a: unknown[]) => unknown).apply(target, args));
      }
      return value;
    },
  });
}

/**
 * Wrap a tenant / anon Supabase client so its `.from()` / `.rpc()` chains expose
 * the no-op opt-out marker (see `wrapRlsBuilderWithNoopOptOut`).
 * Every other property is forwarded to the underlying client unchanged.
 */
function withNoopSiteFilterOptOut<T extends SupabaseClient<Database>>(client: T): T {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: string) =>
          wrapRlsBuilderWithNoopOptOut(
            (target as unknown as { from: (t: string) => unknown }).from(table),
          );
      }
      if (prop === "rpc") {
        return (...args: unknown[]) =>
          wrapRlsBuilderWithNoopOptOut(
            (target as unknown as { rpc: (...a: unknown[]) => unknown }).rpc(...args),
          );
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}

/**
 * Test-only handle for the no-op opt-out shim so unit tests can assert the
 * behaviour against a fake builder without constructing a real client.
 * Production code must not import this.
 */
export const __withNoopSiteFilterOptOutForTests = withNoopSiteFilterOptOut;

/** A7-005: Verify the HMAC signature on the x-site-id fallback header. */
async function verifySiteIdSignature(siteId: string, signature: string | null): Promise<boolean> {
  // If no signature is present, reject the fallback in production.
  if (!signature) {
    return process.env.NODE_ENV !== "production";
  }
  const expected = await signSiteIdFallback(siteId);
  if (!expected) return process.env.NODE_ENV !== "production";
  return timingSafeEqual(signature, expected);
}

// Environment variables are resolved lazily (inside functions) so that
// module evaluation during `next build` does not throw when the vars
// are not yet available (e.g. Vercel preview builds).
//
// There is intentionally no `placeholder.supabase.co` fallback here:
// in production runtime, `requireEnvInProduction` throws if any of
// NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY is missing, so broken config fails fast
// instead of silently succeeding against a non-existent backend.

function getSupabaseUrl(): string {
  const url = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");

  return url;
}

// H-3: Legacy getServiceClient export removed. All callers must use
// getPrivilegedSupabaseClient from lib/server-only/service-role.ts.
// ESLint no-restricted-imports rule still blocks the name to catch stale
// imports in rebased branches.

const ACTIVE_SITE_COOKIE = "nh_active_site";

export async function getTenantClient(): Promise<SupabaseClient<Database>> {
  let siteId: string | null = null;
  let userId: string | null = null;

  // P-01: Admin routes operate on the active site selected in the dashboard;
  // public routes must respect the URL/domain via the signed x-site-id header.
  // Relying on the admin active-site cookie for public pages (e.g. preview)
  // causes a 404 when the cookie points to a different tenant than the request.
  let isAdminRoute = false;
  try {
    const h = await headers();
    const pathname = h.get(PATHNAME_HEADER) ?? "";
    if (pathname.startsWith("/q7m-k4j9") || pathname.startsWith("/api/admin")) {
      isAdminRoute = true;
    }
  } catch {
    // fail-open: headers not available (e.g. outside request scope)
  }

  // A-017: In admin contexts, resolve site_id from the session cookie rather
  // than the x-site-id header (which can be spoofed by a compromised client).
  // P1-9: Verify server-side membership before honoring nh_active_site.
  if (isAdminRoute) {
    try {
      const session = await getAdminSession();
      if (session?.userId) {
        userId = session.userId;
        const cookieStore = await cookies();
        const activeSlug = cookieStore.get(ACTIVE_SITE_COOKIE)?.value ?? null;
        if (activeSlug) {
          // Use a privileged client to resolve the slug → UUID so we don't
          // recurse through getTenantClient().
          const priv = getPrivilegedSupabaseClient();
          const dbSite = await getSiteRowBySlugWithClient(activeSlug, async () => priv);
          if (dbSite) {
            // P1-9: Verify the admin user actually has membership on this site.
            // super_admin users bypass the membership check (they have access to all sites).
            if (session.role === "super_admin") {
              siteId = dbSite.id;
            } else {
              // A30-006: Primary read for authz — membership check must not see stale replica data
              const { data: membership } = await authzPrimaryRead(async () =>
                priv
                  .from("admin_site_memberships")
                  .select("id")
                  .eq("admin_user_id", userId!)
                  .eq("site_id", dbSite.id)
                  .single(),
              );
              if (membership) {
                siteId = dbSite.id;
              }
              // If no membership, siteId stays null — falls back to x-site-id header
            }
          }
        }
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      // If not in a request context where cookies work, ignore
    }
  }

  // Public pages: use the middleware-injected, HMAC-signed x-site-id header.
  // A7-005: Verify the signature to prevent tenant fixation.
  if (!siteId) {
    const h = await headers();
    const rawSiteId = h.get("x-site-id");
    const siteIdSig = h.get("x-site-id-sig");
    if (rawSiteId && (await verifySiteIdSignature(rawSiteId, siteIdSig))) {
      // The x-site-id header carries the site SLUG. Resolve it to the DB UUID
      // before minting the JWT: the tenant_isolation RLS policy runs
      // current_request_site_ids(), which casts the app_metadata.site_id claim
      // to uuid. A slug there throws `22P02 invalid input syntax for type uuid`
      // and every public tenant-scoped query fails.
      try {
        const priv = getPrivilegedSupabaseClient();
        const dbSite = await getSiteRowBySlugWithClient(rawSiteId, async () => priv);
        siteId = dbSite?.id ?? null;
      } catch {
        // fail-closed: leave siteId null so RLS returns no rows rather than erroring
        siteId = null;
      }
    }
  }

  return withNoopSiteFilterOptOut(
    await getAuthenticatedClient(
      siteId,
      userId,
      "authenticated",
      siteId ? allSiteTags(siteId) : [],
    ),
  );
}

/**
 * Tenant client scoped to an EXPLICIT, already-validated `siteId`.
 *
 * `getTenantClient()` re-derives the active site from request state (the
 * `nh_active_site` cookie, then the HMAC-signed `x-site-id` header). In admin
 * API handlers that derivation can come back empty — e.g. when middleware does
 * not inject `x-site-id` on `/api/admin/*` and the active-site cookie is not
 * carried on the write request. The minted JWT then has no
 * `app_metadata.site_id` claim, so `current_request_site_ids()` is empty and
 * the `tenant_isolation` RLS WITH CHECK rejects every INSERT/UPDATE/DELETE with
 * Postgres 42501 — surfacing in the dashboard as "Failed to create …".
 *
 * Admin routes already resolve and authorize the active site in
 * `withAuthz`/`requireAdmin` (via the privileged admin-guard path) and receive
 * it as `siteId`. Passing that validated id here mints a JWT carrying the
 * correct `site_id` claim, so the write satisfies RLS WITHOUT bypassing it —
 * tenant isolation stays enforced by Postgres, exactly as designed. Use this
 * for admin mutations on tenant-scoped tables (categories, products, content,
 * pages, ad placements) instead of the service-role client.
 *
 * SECURITY: `siteId` MUST be a server-derived, authorized DB UUID (the
 * `withAuthz` context value) — never a raw client-supplied string.
 */
export async function getTenantClientForSite(
  siteId: string,
  userId?: string | null,
): Promise<SupabaseClient<Database>> {
  return withNoopSiteFilterOptOut(
    await getAuthenticatedClient(siteId, userId ?? null, "authenticated"),
  );
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
export function getAnonClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  // P1-7: Do not cache anon clients globally. Even with persistSession=false,
  // a shared singleton risks cross-request state bleed through future headers,
  // fetch wrappers, or library internals.
  // A98-16: Circuit breaker for Supabase anon client — prevents cascading
  // failures when Supabase is degraded by short-circuiting fetch calls.
  const anonBreaker = getCircuitBreaker("supabase-anon", {
    failureThreshold: 3,
    recoveryTimeoutMs: 15_000,
  });

  const anonClient = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (input, init) => {
        try {
          return await anonBreaker.execute(() =>
            fetchWithTimeout(input as string, {
              ...init,
              timeoutMs: 8000,
              next: {
                revalidate: 60,
                ...(init as FetchWithTimeoutOptions | undefined)?.next,
              },
            }),
          );
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            logger.warn("[getAnonClient] circuit breaker OPEN — fast-failing", {
              breaker: anonBreaker.metrics(),
            });
          } else {
            logger.error("[getAnonClient] DB fetch failed (timeout or network)", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          return new Response(JSON.stringify({ error: "Service Unavailable", data: null }), {
            status: 503,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          });
        }
      },
    },
  });

  return withNoopSiteFilterOptOut(anonClient);
}

/* ------------------------------------------------------------------ */
/*  G-32: JWT token cache removed                                      */
/*                                                                     */
/*  Previously this module memoised the per-user JWT for 30 s (A-008)  */
/*  to avoid re-signing on every request. The cache key was            */
/*  (role, siteId, userId) — it carried no notion of the user's        */
/*  current role/permission state, so a user demoted in the DB (e.g.   */
/*  super_admin → admin, or admin → deactivated) kept their elevated   */
/*  token for up to 30 s after the change. RLS evaluates the JWT, so   */
/*  during that window the demoted user could still write through      */
/*  policies that should already deny them.                            */
/*                                                                     */
/*  Mitigation: drop the cache and mint a fresh JWT per call.          */
/*  HS256 signing with `jose` is sub-millisecond — the perf cost is    */
/*  negligible compared with the round-trip to PostgREST that follows. */
/*  If we ever need to reintroduce caching, the cache key MUST include */
/*  an `auth_version` token bumped on every role / is_active change so */
/*  invalidation happens synchronously with the privilege change       */
/*  rather than waiting for the TTL to expire.                         */
/* ------------------------------------------------------------------ */

/**
 * A tenant Supabase JWT only needs to live for one request — the
 * client is minted, used to fire a single PostgREST round-trip, then
 * discarded (the `getAuthenticatedClient` cache was removed in G-32).
 * Workers cap CPU at 30 s per request, so 90 s is generous margin
 * for the slowest PostgREST roundtrip while keeping the replay window
 * tight if a token is ever captured in a log or proxy buffer.
 */
const TENANT_JWT_EXPIRY_SECONDS = 90;

async function mintSupabaseJwt(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TENANT_JWT_EXPIRY_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

// `getAuthenticatedClient` was introduced in this branch to mint a custom
// JWT signed with SUPABASE_JWT_SECRET so RLS could evaluate a scoped user
// context instead of always bypassing via service_role.
async function getAuthenticatedClient(
  siteId?: string | null,
  userId?: string | null,
  role = "authenticated",
  cacheTags: string[] = [],
): Promise<SupabaseClient<Database>> {
  const url = getSupabaseUrl();
  const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const secret = requireEnvInProduction("SUPABASE_JWT_SECRET");

  const appMetadata: Record<string, unknown> = {};
  if (siteId) appMetadata.site_id = siteId;

  const payload: Record<string, unknown> = { role, app_metadata: appMetadata };
  if (userId) payload.sub = userId;

  const token = await mintSupabaseJwt(secret, payload);

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      fetch: async (input, init) => {
        const nextOptions = (init as FetchWithTimeoutOptions | undefined)?.next;
        // Admin requests (minted with a user sub) must never be served from a
        // stale fetch cache; the dashboard shows empty tables after writes
        // otherwise. Public/anonymous requests can still use the ISR-friendly
        // revalidate tags.
        const isAdmin = typeof userId === "string" && userId.length > 0;
        if (isAdmin) {
          return fetchWithTimeout(input as string, {
            ...init,
            timeoutMs: 12000,
            cache: "no-store",
          });
        }
        return fetchWithTimeout(input as string, {
          ...init,
          timeoutMs: 12000,
          ...(cacheTags.length > 0
            ? {
                next: {
                  revalidate: nextOptions?.revalidate ?? 60,
                  tags: Array.from(new Set([...cacheTags, ...(nextOptions?.tags ?? [])])),
                },
              }
            : {}),
        });
      },
    },
  });
}
