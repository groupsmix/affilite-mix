-- ═══════════════════════════════════════════════════════
-- Migration 00038: Align anon write policies on telemetry tables
-- ═══════════════════════════════════════════════════════
--
-- Context / problem
-- ─────────────────
-- Audit against production (`odgtwjkzwciohhhqdtti`) found that neither
--   - `public_insert_ad_impressions` on `ad_impressions`, nor
--   - `web_vitals_anon_insert` (or the older "Allow anonymous inserts")
--     on `web_vitals`
-- currently exist on the live database.  The REPO, however, still
-- described them as "intentionally kept" in several places:
--   - `supabase/schema.sql`
--   - `supabase/migrations/00034_remove_public_anon_insert_policies.sql`
--     (comment block under "Out of scope")
--   - `supabase/migrations/00037_drop_public_select_policies.sql`
--     (comment block under "Kept intentionally")
--   - `docs/public-rls-inventory.md`
--
-- So the repo disagreed with prod: prod is stricter than the repo
-- believed.  Both telemetry writers use `getServiceClient()` already
-- (see `app/api/vitals/route.ts` and `lib/dal/ad-impressions.ts`), so
-- no anon INSERT policy is needed by the application.
--
-- What this migration does
-- ────────────────────────
-- 1. Explicitly drops any historical anon INSERT policy on either
--    telemetry table (idempotent — safe on prod where they are
--    already absent, and on any branch / staging where they may
--    still linger).
-- 2. REVOKEs `INSERT` on both tables from the `anon` role as
--    belt-and-suspenders — matches the pattern used in
--    `00037_drop_public_select_policies.sql`.
--
-- Companion doc update: `docs/public-rls-inventory.md` is updated in
-- the same PR to remove the "Tables with public-write (INSERT)
-- policies" section.
--
-- Safe to re-run: `DROP POLICY IF EXISTS` + `REVOKE` are idempotent.
-- ═══════════════════════════════════════════════════════

-- ── 1. Drop any legacy anon INSERT policies ────────────────────────
DROP POLICY IF EXISTS "public_insert_ad_impressions" ON ad_impressions;
DROP POLICY IF EXISTS "web_vitals_anon_insert"       ON web_vitals;
DROP POLICY IF EXISTS "Allow anonymous inserts"      ON web_vitals;

-- ── 2. REVOKE INSERT from anon on both telemetry tables ────────────
REVOKE INSERT ON ad_impressions FROM anon;
REVOKE INSERT ON web_vitals     FROM anon;
