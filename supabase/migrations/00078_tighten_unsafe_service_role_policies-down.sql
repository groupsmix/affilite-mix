-- Down-migration for 00078: restore the 00055 baseline.
--
-- 00078 is a no-op relative to 00055 on any DB that ran 00055, so the
-- "revert" is really just re-asserting the 00055 hardened form.
-- We deliberately do NOT restore the pre-00055 `FOR ALL USING (true)`
-- shape: that form is the exact anti-pattern 00055 fixed, and
-- scripts/check-migrations.sh treats it as a CI violation.

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
    'service_role_exp_events:experiment_events'
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
