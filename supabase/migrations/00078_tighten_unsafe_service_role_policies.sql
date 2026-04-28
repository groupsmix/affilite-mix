-- ═══════════════════════════════════════════════════════
-- F-006 follow-up: tighten unsafe `FOR ALL USING (true)` policies
-- ═══════════════════════════════════════════════════════
-- Migrations 00046–00052 historically created service-role policies as
-- `FOR ALL USING (true) WITH CHECK (true)` — without `TO service_role`,
-- this matches every role (including anon) when RLS is bypassed via the
-- direct connection, and trips the F-006 migration-policy lint.
--
-- Migration 00055 already dropped and recreated each of these policies
-- with the stricter defense-in-depth form
-- `FOR ALL TO service_role USING (auth.role() = 'service_role')`.
-- This migration restates that same form idempotently so databases that
-- somehow regressed to the loose `USING (true)` shape (or skipped 00055)
-- end up at the hardened pattern. It must never downgrade the policy
-- below the 00055 baseline.
--
-- Idempotent: DROP POLICY IF EXISTS + DO-block guarded CREATE POLICY.

DO $$
DECLARE
  targets text[] := ARRAY[
    'service_role_price_snapshots:price_snapshots',
    'service_role_price_alerts:price_alerts',
    'service_role_quizzes:quizzes',
    'service_role_quiz_submissions:quiz_submissions',
    'service_role_drip_campaigns:drip_campaigns',
    'service_role_drip_enrollments:drip_enrollments',
    'service_role_commissions:commissions',
    'service_role_product_epc:product_epc_stats',
    'service_role_deals:deals',
    'service_role_wrist_shots:wrist_shots',
    'service_role_comments:comments',
    'service_role_memberships:memberships',
    'service_role_experiments:experiments',
    'service_role_exp_assignments:experiment_assignments',
    'service_role_exp_events:experiment_events',
    -- 00033 already retightened these to `auth.role() = 'service_role'`,
    -- but staging drifted back to the loose `USING (true)` shape. Restate
    -- the hardened form here so db-audit (E-6) [C] passes.
    'ai_drafts_service_all:ai_drafts',
    'affiliate_networks_service_all:affiliate_networks'
  ];
  pair text;
  pol_name text;
  tbl_name text;
BEGIN
  FOREACH pair IN ARRAY targets LOOP
    pol_name := split_part(pair, ':', 1);
    tbl_name := split_part(pair, ':', 2);
    IF to_regclass('public.' || tbl_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol_name, tbl_name);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO service_role USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
        pol_name, tbl_name
      );
    END IF;
  END LOOP;
END $$;

-- ── web_vitals: drop residual anon INSERT policy (db-audit [B]) ──────
-- 00038 already dropped this on fresh-DB replays, but staging still
-- carries the legacy `Allow anonymous inserts` policy from 00023.
-- Re-assert the drop + REVOKE here so the audit passes everywhere.
-- All telemetry writes already go through the service role.
DO $$
BEGIN
  IF to_regclass('public.web_vitals') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Allow anonymous inserts" ON web_vitals';
    EXECUTE 'REVOKE INSERT ON web_vitals FROM anon';
  END IF;
END $$;
