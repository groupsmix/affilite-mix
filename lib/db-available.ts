/**
 * Lightweight pre-flight check: is Supabase configured in this process?
 *
 * Rules:
 *  - Returns `false` when NEXT_PUBLIC_SUPABASE_URL is absent, empty, or
 *    contains the legacy "placeholder" sentinel that some older scripts used.
 *  - Returns `true` otherwise — the URL is present and looks real.
 *
 * This is intentionally a cheap synchronous check so it can be called at the
 * top of any server component, DAL helper, or layout without I/O overhead.
 *
 * Usage:
 *   import { isSupabaseConfigured } from "@/lib/db-available";
 *   if (!isSupabaseConfigured()) return null; // skip DB work silently
 *
 * The check deliberately does NOT validate the key / service-role secret —
 * those are only needed when a client is actually created, and
 * `requireEnvInProduction` in `lib/supabase-server.ts` handles that.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.trim().length === 0) return false;
  if (url.includes("placeholder")) return false;
  return true;
}

import { PHASE_PRODUCTION_BUILD } from "next/constants";

/**
 * True when we are inside a `next build` static-generation phase.
 *
 * Next.js sets `NEXT_PHASE` to `PHASE_PRODUCTION_BUILD` ("phase-production-build")
 * during `next build`. We use this to suppress expected "DB not available"
 * log noise at build time — the warnings are harmless but confusing in CI
 * output, so we suppress them when it is clear that no runtime DB is expected.
 *
 * PROD-INCIDENT (2026-06-11): this check MUST compare against the exact
 * build-phase constant. `NEXT_PHASE` is also defined at runtime in the
 * deployed Worker (e.g. `phase-production-server`), so the previous
 * truthiness check (`!!process.env.NEXT_PHASE`) made `shouldSkipDbCall()`
 * return `true` on every production request. Every guarded DAL helper
 * (site slug→UUID resolution, homepage lists, sitemap, metadata) silently
 * returned empty, which rendered all public sites as content-less shells
 * while unguarded queries kept failing with `site_id=eq.<slug>` 400s.
 *
 * We compare against Next's exported `PHASE_PRODUCTION_BUILD` constant
 * rather than the string literal so that if Next ever renames the phase,
 * we get a compile-time mismatch instead of a silent runtime regression.
 */
function isBuildPhase(): boolean {
  return process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD;
}

/**
 * Combined helper: returns `true` when a DB call is worth attempting.
 *
 * A DB call is pointless (and will always produce a noisy error) when either:
 *   - Supabase is not configured (no URL env var), OR
 *   - We are inside `next build` static generation with no DB available.
 *
 * The build-phase skip is load-bearing: `SUPABASE_SERVICE_ROLE_KEY` is a
 * Worker runtime secret (set via `wrangler secret put`) and is NOT present
 * during `next build`. Without this guard, server components that call
 * `getServiceClient()` during prerender — e.g. `app/(public)/deals/page.tsx`
 * via `listActiveDeals` — crash with `supabaseKey is required` and abort
 * the build. Pages render a static fallback at build time and fetch real
 * data at request time when the Worker has the secret.
 *
 * Callers that want to silently skip optional DB enrichment (metadata, themes,
 * favicons, sitemap entries) should use this instead of `isSupabaseConfigured`
 * alone.
 */
export function shouldSkipDbCall(): boolean {
  return !isSupabaseConfigured() || isBuildPhase();
}
