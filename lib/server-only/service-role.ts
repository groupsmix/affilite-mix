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
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  A-10 (audit) — DO NOT MUTATE THE RETURNED CLIENT.                   ║
// ║                                                                      ║
// ║  `_privilegedClient` below is memoised at module scope, which means  ║
// ║  every request that runs inside the same Cloudflare Worker isolate   ║
// ║  receives the exact same SupabaseClient instance. Mutating any       ║
// ║  property on that client (in particular `client.headers` /           ║
// ║  `client.rest.headers`) leaks across requests for unrelated tenants  ║
// ║  and produces auth/CORS/PII bugs that are extremely hard to trace.   ║
// ║                                                                      ║
// ║  We freeze the cached reference (Object.freeze) and ESLint enforces  ║
// ║  a `no-restricted-syntax` rule that bans `<client>.headers.*= …`     ║
// ║  and `getServiceClient().<x>= …` mutation patterns project-wide.     ║
// ║  If you need per-request headers, build them at construction time    ║
// ║  inside `global.headers` of a fresh client (see                      ║
// ║  `getAuthenticatedClient` in lib/supabase-server.ts).                ║
// ╚══════════════════════════════════════════════════════════════════════╝
import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnvInProduction } from "@/lib/env";
import type { Database } from "@/types/supabase";
import { fetchWithTimeout } from "@/lib/fetch-timeout";

let _privilegedClient: SupabaseClient<Database> | null = null;

/**
 * Returns a Supabase client authenticated with `SUPABASE_SERVICE_ROLE_KEY`.
 *
 * RLS is bypassed by this client — every caller is responsible for its own
 * site / tenant scoping (e.g. `.eq("site_id", verifiedSiteId)` on every
 * query). For request-scoped reads you almost always want
 * `getTenantClient()` from `lib/server-only/supabase.ts`, which mints a
 * scoped JWT and lets RLS act as a defence-in-depth layer.
 *
 * The client is memoised per isolate; it does not hold mutable session
 * state (`persistSession: false`).
 */
export function getPrivilegedSupabaseClient(): SupabaseClient<Database> {
  if (_privilegedClient) return _privilegedClient;

  const url = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY");

  const client = createClient<Database>(url, key, {
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

  // A-10: freeze the memoised reference so a stray
  // `client.someField = …` reassignment fails fast (in strict mode).
  // supabase-js does not expose a public mutable header bag, but the
  // freeze + ESLint rule together close the door on accidental cross-
  // request bleed inside a long-lived Worker isolate.
  _privilegedClient = Object.freeze(client) as SupabaseClient<Database>;

  return _privilegedClient;
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
}
