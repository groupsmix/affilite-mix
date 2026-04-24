-- ═══════════════════════════════════════════════════════
-- Migration 00055: Harden remaining RLS policies (E-1)
-- ═══════════════════════════════════════════════════════
--
-- Audit finding F3 / epic E-1 — migrations 00046..00052 introduced
-- service_role RLS policies written as `FOR ALL USING (true)`.  With
-- RLS enabled this is safe in practice because service_role bypasses
-- RLS entirely, but the policy definition says the opposite: "allow
-- every role".  If RLS is ever disabled or bypassed for another role
-- (anon, authenticated) those policies silently become permissive.
--
-- This migration drops each of those policies and recreates them
-- scoped to the service_role, matching the pattern already in use by
-- migrations 00040 and 00043+.
--
-- Tables covered (15 policies across 7 migrations):
--   00046: price_snapshots, price_alerts
--   00047: quizzes, quiz_submissions, drip_campaigns, drip_enrollments
--   00048: commissions, product_epc_stats
--   00049: deals
--   00050: wrist_shots, comments
--   00051: memberships
--   00052: experiments, experiment_assignments, experiment_events
--
-- Safety: every statement is idempotent (DROP POLICY IF EXISTS +
-- CREATE POLICY) and changes no effective access for service_role,
-- which bypasses RLS regardless of policy contents.
--
-- Note on filename: the audit doc asks for `00054_harden_remaining_rls.sql`
-- but `00054_` was already taken by `00054_stripe_events.sql` at the
-- time this task was written.  Using the next free ordinal (00055).
-- ═══════════════════════════════════════════════════════

-- ── 00046: price snapshots + alerts ─────────────────────
DROP POLICY IF EXISTS "service_role_price_snapshots" ON price_snapshots;
CREATE POLICY "service_role_price_snapshots" ON price_snapshots
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_price_alerts" ON price_alerts;
CREATE POLICY "service_role_price_alerts" ON price_alerts
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 00047: quiz funnel ──────────────────────────────────
DROP POLICY IF EXISTS "service_role_quizzes" ON quizzes;
CREATE POLICY "service_role_quizzes" ON quizzes
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_quiz_submissions" ON quiz_submissions;
CREATE POLICY "service_role_quiz_submissions" ON quiz_submissions
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_drip_campaigns" ON drip_campaigns;
CREATE POLICY "service_role_drip_campaigns" ON drip_campaigns
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_drip_enrollments" ON drip_enrollments;
CREATE POLICY "service_role_drip_enrollments" ON drip_enrollments
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 00048: commissions + EPC ────────────────────────────
DROP POLICY IF EXISTS "service_role_commissions" ON commissions;
CREATE POLICY "service_role_commissions" ON commissions
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_product_epc" ON product_epc_stats;
CREATE POLICY "service_role_product_epc" ON product_epc_stats
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 00049: deals ────────────────────────────────────────
DROP POLICY IF EXISTS "service_role_deals" ON deals;
CREATE POLICY "service_role_deals" ON deals
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 00050: community UGC ────────────────────────────────
DROP POLICY IF EXISTS "service_role_wrist_shots" ON wrist_shots;
CREATE POLICY "service_role_wrist_shots" ON wrist_shots
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_comments" ON comments;
CREATE POLICY "service_role_comments" ON comments
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 00051: memberships ──────────────────────────────────
DROP POLICY IF EXISTS "service_role_memberships" ON memberships;
CREATE POLICY "service_role_memberships" ON memberships
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 00052: A/B testing + review state ───────────────────
DROP POLICY IF EXISTS "service_role_experiments" ON experiments;
CREATE POLICY "service_role_experiments" ON experiments
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_exp_assignments" ON experiment_assignments;
CREATE POLICY "service_role_exp_assignments" ON experiment_assignments
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "service_role_exp_events" ON experiment_events;
CREATE POLICY "service_role_exp_events" ON experiment_events
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
