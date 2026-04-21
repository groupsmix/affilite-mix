-- ═══════════════════════════════════════════════════════
-- Migration 00038: Harden public INSERT policies on telemetry tables
-- ═══════════════════════════════════════════════════════
--
-- Problem
-- -------
-- Two tables still allowed direct inserts from the anon Supabase key:
--
--   * web_vitals      — "Allow anonymous inserts" (WITH CHECK true). The web
--                       vitals beacon at `app/api/vitals/route.ts` already
--                       uses getServiceClient() (server-side, rate-limited,
--                       metric-name whitelisted, CHECK-constrained). The
--                       anon-facing policy is dead code — the browser never
--                       calls supabase-js for web_vitals — but leaving it in
--                       place lets any anon caller bypass the API's
--                       rate-limit and allow-list.
--
--   * ad_impressions  — `public_insert_ad_impressions` is referenced in
--                       docs/public-rls-inventory.md, but no migration ever
--                       created it on this project (only the service-role
--                       policy exists on remote). The ad impression beacon
--                       at `app/api/track/impression/route.ts` already
--                       resolves the caller's `site_id` server-side and
--                       inserts via getServiceClient(). Docs called for
--                       tightening this to require an *active* site; with
--                       no public INSERT policy in place, the server path
--                       is the only path — and it already binds to the
--                       current site via `resolveDbSiteId(site.id)`, which
--                       fails fast on unknown / inactive sites. We codify
--                       that the anon role has zero write access here.
--
-- Fix
-- ----
-- 1. Drop any lingering public/anon INSERT policies on these tables (both
--    possible historical names covered).
-- 2. REVOKE INSERT from anon as belt-and-suspenders, matching the pattern
--    established in migration 00035 for tenant-scoped SELECTs.
--
-- Both tables retain their `*_service_all` / service-role ALL policies, so
-- server code that uses getServiceClient() continues to work unchanged.
--
-- Not re-introduced
-- -----------------
-- * We do NOT add an anon-facing INSERT policy gated on sites.is_active.
--   The current architecture routes all public telemetry through signed,
--   rate-limited server endpoints, which is stricter than any RLS gate
--   we could express.
--
-- Safe to re-run: DROP POLICY IF EXISTS + REVOKE are idempotent.
-- ═══════════════════════════════════════════════════════

-- ── web_vitals ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow anonymous inserts" ON web_vitals;

DROP POLICY IF EXISTS "web_vitals_anon_insert" ON web_vitals;

REVOKE INSERT ON web_vitals FROM anon;

-- ── ad_impressions ───────────────────────────────────────────────────
-- Drop any historical public INSERT policy shape. None of these exist on
-- the current production project; the DROP IF EXISTS is a no-op in that
-- case and protects any environment that still carries a legacy copy.
DROP POLICY IF EXISTS "public_insert_ad_impressions" ON ad_impressions;

DROP POLICY IF EXISTS "Public can insert ad impressions" ON ad_impressions;

DROP POLICY IF EXISTS "ad_impressions_public_insert" ON ad_impressions;

REVOKE INSERT ON ad_impressions FROM anon;
