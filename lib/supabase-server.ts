import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { SignJWT } from "jose";
import { headers, cookies } from "next/headers";
import { getAdminSession } from "@/lib/auth";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { getSiteRowBySlugWithClient } from "@/lib/dal/sites";

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

const ACTIVE_SITE_COOKIE = "nh_active_site";

export async function getTenantClient(): Promise<SupabaseClient<Database>> {
  let siteId: string | null = null;

  // A-017: In admin contexts, resolve site_id from the session cookie rather
  // than the x-site-id header (which can be spoofed by a compromised client).
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
        const dbSite = await getSiteRowBySlugWithClient(activeSlug, async () => getPrivilegedSupabaseClient());
        if (dbSite) {
          siteId = dbSite.id;
        }
      }
    }
  } catch {
    // If not in a request context where cookies work, ignore
  }

  // Public pages (no admin session): fall back to the header injected by middleware.
  if (!siteId) {
    const h = await headers();
    siteId = h.get("x-site-id");
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
  _anonClient = createClient<Database>(url, key, {
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
  return _anonClient;
}

/* ------------------------------------------------------------------ */
/*  A-008: JWT token cache (30-second TTL)                             */
/* ------------------------------------------------------------------ */
interface JwtCacheEntry {
  token: string;
  expiresAt: number;
}
const jwtTokenCache = new Map<string, JwtCacheEntry>();
const JWT_CACHE_TTL_MS = 30_000;

function getJwtCacheKey(siteId: string | null | undefined, userId: string | null | undefined, role: string): string {
  return `${role}:${siteId ?? "_"}:${userId ?? "_"}`;
}

async function mintToken(secret: string, payload: Record<string, unknown>): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}

// `getAuthenticatedClient` was introduced in this branch to mint a custom
// JWT signed with SUPABASE_JWT_SECRET so RLS could evaluate a scoped user
// context instead of always bypassing via service_role.
export async function getAuthenticatedClient(
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

  const cacheKey = getJwtCacheKey(siteId, userId, role);
  const now = Date.now();
  const cached = jwtTokenCache.get(cacheKey);

  let token: string;
  if (cached && cached.expiresAt > now) {
    token = cached.token;
  } else {
    token = await mintToken(secret, payload);
    jwtTokenCache.set(cacheKey, { token, expiresAt: now + JWT_CACHE_TTL_MS });
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
