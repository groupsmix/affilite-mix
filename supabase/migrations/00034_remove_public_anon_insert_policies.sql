-- ═══════════════════════════════════════════════════════
-- Migration 00034: Remove public anon INSERT policies on
--                  affiliate_clicks and newsletter_subscribers
-- ═══════════════════════════════════════════════════════
--
-- Problem: migrations 00001 and 00024 created two public INSERT policies
-- that let the anon key write directly to these tables from the browser:
--
--   - public_insert_clicks       ON affiliate_clicks
--   - public_insert_newsletter   ON newsletter_subscribers
--
-- The only server-side callers — `lib/dal/affiliate-clicks.ts` (used by
-- `app/api/track/click/route.ts`) and the three `app/api/newsletter/*`
-- routes — all go through `getServiceClient()`, so these INSERTs happen
-- under service_role (bypassing RLS anyway).  The anon-facing policies
-- are therefore pure attack surface: a browser-issued Supabase REST call
-- with the public anon key + a valid `site_id` could insert arbitrary
-- rows, bypass Turnstile/rate-limit, and poison analytics / subscriber
-- lists.
--
-- Fix: drop both anon INSERT policies so writes are only possible via
-- the service_role policies (`service_full_access_clicks`,
-- `service_full_access_newsletter`) that migration 00003 already put in
-- place.  RLS remains enabled on both tables, so the default-deny rule
-- takes over and the anon key is blocked.
--
-- Safe to re-run: `DROP POLICY IF EXISTS` is idempotent.  Rollback would
-- re-run the policy bodies from migration 00024; kept out of this file
-- on purpose — rolling back would re-open the exposure.
--
-- Out of scope:
--   - `public_insert_ad_impressions` on `ad_impressions` — ad tracking
--     currently has no server-side endpoint equivalent; left as-is to
--     avoid silently breaking impression logging.  Should be revisited
--     once a dedicated impression route exists.
--   - `web_vitals_anon_insert` on `web_vitals` — same rationale, and
--     migration 00033 just added CHECK constraints to harden it.
-- ═══════════════════════════════════════════════════════

-- ── affiliate_clicks ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_insert_clicks" ON affiliate_clicks;
DROP POLICY IF EXISTS "Public can insert clicks" ON affiliate_clicks;

-- ── newsletter_subscribers ───────────────────────────────────────────
DROP POLICY IF EXISTS "public_insert_newsletter" ON newsletter_subscribers;
DROP POLICY IF EXISTS "Public can insert newsletter" ON newsletter_subscribers;
