-- ═══════════════════════════════════════════════════════
-- Migration 00080: Re-drop `public_insert_ad_impressions` on ad_impressions
-- ═══════════════════════════════════════════════════════
--
-- Problem
-- -------
-- The anon-role INSERT policy `public_insert_ad_impressions` on
-- public.ad_impressions was already dropped in migration 00038 and is
-- documented as removed in docs/public-rls-inventory.md. However the
-- staging database still carries it — same failure mode as the
-- web_vitals anon INSERT that migration 00079 had to re-drop, likely
-- because 00038 was not applied cleanly, or the policy was re-created
-- by an external process.
--
-- The db-audit invariant [B] (RLS policies that include 'anon' in
-- their roles array) correctly flags this on every run:
--
--   • public.ad_impressions → public_insert_ad_impressions
--     (cmd=INSERT, roles=anon)
--
-- The impression beacon at `app/api/track/impression/route.ts`
-- resolves `site_id` server-side and inserts via `getServiceClient()`,
-- so no public path to this table exists in the application. The
-- policy is purely a historical leftover.
--
-- Fix
-- ----
-- Re-drop every known historical policy shape (same set covered in
-- 00038) and REVOKE INSERT from anon as belt-and-suspenders. The
-- service-role ALL policy is untouched — server-side writes via
-- getServiceClient() continue to work unchanged.
--
-- Safe to re-run: DROP POLICY IF EXISTS + REVOKE are idempotent.
-- ═══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "public_insert_ad_impressions" ON ad_impressions;

DROP POLICY IF EXISTS "Public can insert ad impressions" ON ad_impressions;

DROP POLICY IF EXISTS "ad_impressions_public_insert" ON ad_impressions;

REVOKE INSERT ON ad_impressions FROM anon;
