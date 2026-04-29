-- Down migration for 00060
-- Restore the original open policies from migration 00029.

-- ── ai_drafts ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "ai_drafts_service_all" ON ai_drafts;
CREATE POLICY "ai_drafts_service_all" ON ai_drafts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── affiliate_networks ─────────────────────────────────────────────
DROP POLICY IF EXISTS "affiliate_networks_service_all" ON affiliate_networks;
CREATE POLICY "affiliate_networks_service_all" ON affiliate_networks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Note: we do NOT re-create the web_vitals anon INSERT policy on
-- rollback — it should never have existed.
