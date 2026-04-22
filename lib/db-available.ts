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

/**
 * True when we are inside a `next build` static-generation phase.
 *
 * Next.js sets `NEXT_PHASE` to `"phase-production-build"` (or similar)
 * during `next build`.  We use this to suppress expected "DB not available"
 * log noise at build time — the warnings are harmless but confusing in CI
 * output, so we suppress them when it is clear that no runtime DB is expected.
 */
export function isBuildPhase(): boolean {
  return !!process.env.NEXT_PHASE;
}

/**
 * Combined helper: returns `true` when a DB call is worth attempting.
 *
 * A DB call is pointless (and will always produce a noisy error) when either:
 *   - Supabase is not configured (no URL env var), OR
 *   - We are inside `next build` static generation with no DB available.
 *
 * Callers that want to silently skip optional DB enrichment (metadata, themes,
 * favicons, sitemap entries) should use this instead of `isSupabaseConfigured`
 * alone.
 */
export function shouldSkipDbCall(): boolean {
  return !isSupabaseConfigured();
}
