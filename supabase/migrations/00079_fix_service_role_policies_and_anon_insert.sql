-- ═══════════════════════════════════════════════════════
-- Migration 00060: Fix service_role policies on ai_drafts & affiliate_networks
--                  + re-drop lingering web_vitals anon INSERT policy
-- ═══════════════════════════════════════════════════════
--
-- Problems
-- --------
-- 1. ai_drafts_service_all and affiliate_networks_service_all (created in
--    00029) use FOR ALL USING (true) WITHOUT scoping to service_role.
--    Migration 00040 fixed ten other tables but missed these two. The
--    db-audit invariant [C] correctly flags them.
--
-- 2. The "Allow anonymous inserts" policy on web_vitals was dropped in
--    00038, but the staging database still carries it — likely because
--    00038 was not applied, or the policy was re-created by an external
--    process. Re-dropping idempotently to satisfy db-audit invariant [B].
--
-- Fix
-- ----
-- Replace the two open policies with properly scoped service_role guards
-- (same pattern as 00040). Re-drop the web_vitals anon INSERT policy and
-- REVOKE INSERT from anon as belt-and-suspenders.
--
-- Safe to re-run: DROP POLICY IF EXISTS + CREATE POLICY is idempotent.
-- ═══════════════════════════════════════════════════════

-- ── ai_drafts ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_drafts_service_all" ON ai_drafts;
CREATE POLICY "ai_drafts_service_all" ON ai_drafts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── affiliate_networks ─────────────────────────────────────────────
DROP POLICY IF EXISTS "affiliate_networks_service_all" ON affiliate_networks;
CREATE POLICY "affiliate_networks_service_all" ON affiliate_networks
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── web_vitals: re-drop anon INSERT policy ─────────────────────────
DROP POLICY IF EXISTS "Allow anonymous inserts" ON web_vitals;
DROP POLICY IF EXISTS "web_vitals_anon_insert" ON web_vitals;
REVOKE INSERT ON web_vitals FROM anon;
