import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { fetchWithTimeout, type FetchWithTimeoutOptions } from "@/lib/fetch-timeout";
import { SignJWT } from "jose";
import { logger } from "@/lib/logger";
import { headers, cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { getSiteRowBySlugWithClient } from "@/lib/dal/sites";
import { timingSafeEqual } from "@/lib/internal-hmac";
import { authzPrimaryRead } from "@/lib/read-after-write";
import { getCircuitBreaker, CircuitOpenError } from "@/lib/ai/circuit-breaker";
// F-1: signSiteIdFallback moved to lib/site-id-signer.ts (Edge-safe leaf)
// to avoid pulling bcryptjs + jose/deflate into the middleware bundle.
// Callers should import directly from @/lib/site-id-signer.
import { signSiteIdFallback } from "@/lib/site-id-signer";

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

/**
 * Server-only Supabase client using the service role key.
 * Bypasses RLS — use only in server-side code (API routes, Server Actions, DAL)
 * for admin operations that genuinely need to bypass RLS.
 *
 * R3: Removed the global caching anti-pattern. We create a fresh client per request.
 * F19: The previous issue F19 asked to cache this per-isolate because TLS handshake overhead.
 * But R3 asked to fix the singleton anti-pattern. Actually, creating a fresh client in JS
 * DOES NOT create a new TLS handshake every time if the underlying Node.js/Cloudflare
 * fetch implementation reuses connections (which they do via connection pooling).
 * The global client caching was causing cross-request state pollution and was an anti-pattern.
 */
// F-022: Cache clients per-isolate to reduce CPU overhead.
// These clients do not hold mutable state (persistSession: false).
let _anonClient: SupabaseClient<Database> | null = null;
let _anonClientCreatedAt = 0;
let _anonCachedUrl: string | null = null;
let _anonCachedKey: string | null = null;
/**
 * Anon-client cache TTL — mirrors the 5-minute window on the
 * privileged client (`lib/server-only/service-role.ts`) so anon-key
 * rotations propagate to long-lived isolates within one TTL without
 * a forced isolate restart. The cache is also invalidated immediately
 * if the URL or anon key in `process.env` differs from the values
 * used to mint the cached client, so a rotation combined with a
 * `wrangler deploy` rollout takes effect on the next request.
 */
const ANON_CLIENT_TTL_MS = 5 * 60 * 1000;

// H-3: Legacy getServiceClient export removed. All callers must use
// getPrivilegedSupabaseClient from lib/server-only/service-role.ts.
// ESLint no-restricted-imports rule still blocks the name to catch stale
// imports in rebased branches.

const ACTIVE_SITE_COOKIE = "nh_active_site";

export async function getTenantClient(): Promise<SupabaseClient<Database>> {
  let siteId: string | null = null;

  // A-017: In admin contexts, resolve site_id from the session cookie rather
  // than the x-site-id header (which can be spoofed by a compromised client).
  // P1-9: Verify server-side membership before honoring nh_active_site.
  let userId: string | null = null;
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

  // Public pages (no admin session): fall back to the header injected by middleware.
  // A7-005: Verify the x-site-id header is HMAC-signed by middleware to prevent
  // tenant fixation via a spoofed x-site-id header (when no active-site cookie exists).
  if (!siteId) {
    const h = await headers();
    const rawSiteId = h.get("x-site-id");
    const siteIdSig = h.get("x-site-id-sig");
    if (rawSiteId && (await verifySiteIdSignature(rawSiteId, siteIdSig))) {
      siteId = rawSiteId;
    }
  }

  return getAuthenticatedClient(siteId, userId, "authenticated");
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
export function getAnonClient(): SupabaseClient<Database> {
  const url = getSupabaseUrl();
  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const now = Date.now();
  const isExpired = now - _anonClientCreatedAt >= ANON_CLIENT_TTL_MS;
  const envChanged = url !== _anonCachedUrl || key !== _anonCachedKey;

  if (_anonClient && !isExpired && !envChanged) {
    return _anonClient;
  }

  // A98-16: Circuit breaker for Supabase anon client — prevents cascading
  // failures when Supabase is degraded by short-circuiting fetch calls.
  const anonBreaker = getCircuitBreaker("supabase-anon", {
    failureThreshold: 3,
    recoveryTimeoutMs: 15_000,
  });

  _anonClient = createClient<Database>(url, key, {
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
  _anonClientCreatedAt = now;
  _anonCachedUrl = url;
  _anonCachedKey = key;
  return _anonClient;
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
        return fetchWithTimeout(input as string, {
          ...init,
          timeoutMs: 12000,
        });
      },
    },
  });
}
