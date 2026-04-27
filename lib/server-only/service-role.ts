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
export function getPrivilegedSupabaseClient(caller?: string): PrivilegedSupabaseClient {
  if (caller) logPrivilegedUsage(caller);
  if (_privilegedClient) return _privilegedClient as PrivilegedSupabaseClient;

  const url = requireEnvInProduction("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnvInProduction("SUPABASE_SERVICE_ROLE_KEY");

  _privilegedClient = createClient<Database>(url, key, {
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

  return _privilegedClient as PrivilegedSupabaseClient;
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
