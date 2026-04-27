import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { SignJWT } from "jose";
import { headers } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";

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
//
// A-10 (audit): The memoised reference is FROZEN after construction
// (Object.freeze) so a stray `_anonClient = something` reassignment from
// inside this module fails fast in dev. Callers MUST NOT mutate any
// property on the returned client (in particular `client.headers` /
// `client.rest.headers`); the client is shared across every request that
// runs inside the same Worker isolate. ESLint enforces this via a
// `no-restricted-syntax` rule that bans `<client>.headers.*= …` and
// related mutation patterns; see `eslint.config.mjs`.
let _anonClient: SupabaseClient<Database> | null = null;

/**
 * @deprecated Service-role access has moved to the approved server-only
 * gateway at `lib/server-only/service-role.ts`. Import
 * `getPrivilegedSupabaseClient` from there directly. This thin wrapper is
 * kept only so existing tests and a small number of legacy call sites keep
 * working; an ESLint `no-restricted-imports` rule prevents new code from
 * importing it. New code that genuinely needs to bypass RLS must use the
 * gateway.
 */
export function getServiceClient(): SupabaseClient<Database> {
  return getPrivilegedSupabaseClient();
}

export async function getTenantClient(): Promise<SupabaseClient<Database>> {
  const h = await headers();
  const siteId = h.get("x-site-id");

  let userId: string | null = null;
  try {
    const session = await getAdminSession();
    if (session?.userId) {
      userId = session.userId;
    }
  } catch (e) {
    // If not in a request context where cookies work, ignore
  }

  return getAuthenticatedClient(siteId, userId, "authenticated");
}

/**
 * Server-only Supabase client using the anon key.
 * Respects RLS policies — use for public-facing queries (content listing, search, etc.)
 * to provide defense-in-depth security.
 */
export function getAnonClient(): SupabaseClient<Database> {
  if (_anonClient) return _anonClient;

  const url = getSupabaseUrl();
  const key = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: async (input, init) => {
        try {
          const res = await fetchWithTimeout(input as string, {
            ...init,
            timeoutMs: 8000,
            next: {
              revalidate: 60,
              ...(init as any)?.next,
            },
          });
          return res;
        } catch (error) {
          console.error("[getAnonClient] DB fetch failed (timeout or network):", error);
          return new Response(JSON.stringify({ error: "Service Unavailable", data: null }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  });
  // A-10: freeze so callers cannot reassign top-level properties on the
  // memoised client. supabase-js does not expose a public mutable header
  // bag, but freezing the instance plus the ESLint mutation guard makes
  // the contract explicit.
  _anonClient = Object.freeze(client) as SupabaseClient<Database>;
  return _anonClient;
}

// ─────────────────────────────────────────────────────────────────────
// A-08 (audit): per-isolate JWT cache for `getAuthenticatedClient`.
//
// Before this fix, every request through `getTenantClient()` minted a
// fresh HS256 JWT — `jose.SignJWT(...).sign()` is a CPU hot spot under
// load (it does an HMAC of the canonical JSON). With the cache, we sign
// at most one JWT per `(siteId, userId, role)` tuple per
// JWT_CACHE_SLIDING_WINDOW_MS.
//
// The cached entry stores the signed token and the wall-clock time at
// which the cache entry expires (NOT the JWT's own `exp`, which is
// still 1 hour and unchanged below). The cached token therefore stays
// well within its server-side validity window even at the upper edge
// of the 30s sliding window.
//
// Memory bound: a small LRU-like cap protects long-lived isolates from
// unbounded growth on multi-tenant traffic; on overflow we drop the
// oldest entry. 4096 entries × ~512 B ≈ 2 MiB worst case.
// ─────────────────────────────────────────────────────────────────────
const JWT_CACHE_SLIDING_WINDOW_MS = 30_000;
const JWT_CACHE_MAX_ENTRIES = 4096;

interface TenantJwtCacheEntry {
  token: string;
  /** Wall-clock ms after which this cache entry must be re-signed. */
  exp: number;
}

const _tenantJwtCache: Map<string, TenantJwtCacheEntry> = new Map();

function tenantJwtCacheKey(
  siteId: string | null | undefined,
  userId: string | null | undefined,
  role: string,
): string {
  // The empty string is a valid sentinel for "no claim" — both empty
  // siteId and empty userId hash distinctly from any real uuid.
  return `${siteId ?? ""}|${userId ?? ""}|${role}`;
}

/**
 * Test helper: clear the per-isolate JWT cache so unit tests that
 * change `SUPABASE_JWT_SECRET` between cases see fresh signatures.
 * Production code MUST NOT call this.
 */
export function __resetTenantJwtCacheForTests(): void {
  _tenantJwtCache.clear();
}

async function mintTenantJwt(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

// `getAuthenticatedClient` was introduced in this branch to mint a custom
// JWT signed with SUPABASE_JWT_SECRET so RLS could evaluate a scoped user
// context instead of always bypassing via service_role.
//
// A-09 (audit): we now write the tenant scope as `app_metadata.site_ids`
// (uuid array) so RLS can match `site_id = ANY(current_request_site_ids())`
// — the DB function still falls back to the legacy single-claim shapes
// for backward compatibility during the deploy window. The first
// argument may still be passed as a single string for callers (and tests)
// that have not yet been updated; it is wrapped to a one-element array.
export async function getAuthenticatedClient(
  siteIdOrIds?: string | string[] | null,
  userId?: string | null,
  role = "authenticated",
): Promise<SupabaseClient<Database>> {
  const url = getSupabaseUrl();
  const anonKey = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const secret = requireEnvInProduction("SUPABASE_JWT_SECRET");

  const siteIds: string[] = Array.isArray(siteIdOrIds)
    ? siteIdOrIds.filter((s): s is string => typeof s === "string" && s.length > 0)
    : siteIdOrIds
      ? [siteIdOrIds]
      : [];

  // Cache key is tuple-stable: deduped, sorted site_ids + userId + role.
  const dedupedSorted = Array.from(new Set(siteIds)).sort();
  const cacheKey = tenantJwtCacheKey(dedupedSorted.join(","), userId, role);

  let token: string;
  const now = Date.now();
  const cached = _tenantJwtCache.get(cacheKey);
  if (cached && cached.exp > now) {
    token = cached.token;
  } else {
    const payload: Record<string, unknown> = { role };
    if (userId) payload.sub = userId;
    if (dedupedSorted.length > 0) {
      // A-09: server-controlled tenant scope — RLS reads
      // `app_metadata.site_ids` via `current_request_site_ids()`.
      payload.app_metadata = { site_ids: dedupedSorted };
      // Backwards-compat singular claim so any RLS predicate still on
      // 00067's `current_request_site_id()` keeps working until 00072
      // is rolled out everywhere.
      if (dedupedSorted.length === 1) payload.site_id = dedupedSorted[0];
    }

    token = await mintTenantJwt(secret, payload);

    if (_tenantJwtCache.size >= JWT_CACHE_MAX_ENTRIES) {
      // Drop the oldest entry to bound memory in long-lived isolates.
      const firstKey = _tenantJwtCache.keys().next().value;
      if (firstKey !== undefined) _tenantJwtCache.delete(firstKey);
    }
    _tenantJwtCache.set(cacheKey, {
      token,
      exp: now + JWT_CACHE_SLIDING_WINDOW_MS,
    });
  }

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
