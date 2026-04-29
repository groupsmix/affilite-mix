-- ═══════════════════════════════════════════════════════
-- Down migration for 00080: restore the `public_insert_ad_impressions`
-- policy on public.ad_impressions and re-GRANT INSERT to anon.
--
-- This is provided for symmetry only. The application does NOT need
-- this policy — the impression beacon inserts via getServiceClient()
-- on the server. Restore only if you intentionally want to undo the
-- 00038/00080 hardening and allow direct anon inserts again.
-- ═══════════════════════════════════════════════════════

GRANT INSERT ON ad_impressions TO anon;

CREATE POLICY "public_insert_ad_impressions" ON ad_impressions
  FOR INSERT
  TO anon
  WITH CHECK (true);
