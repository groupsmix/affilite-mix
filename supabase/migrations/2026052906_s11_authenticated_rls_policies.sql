-- ============================================================
-- Migration 2026052905: S11-008, S11-009 — authenticated-role
-- RLS policies for product_epc_stats, access_review_log,
-- and subject_objections.
--
-- product_epc_stats: scoped SELECT by site_id from JWT.
-- subject_objections: scoped SELECT by site_id from JWT
--   (compliance table readable by site admins).
-- access_review_log: global SELECT for any authenticated user
--   (audit trail has no site_id — visible to all admins).
-- ============================================================

-- S11-008: product_epc_stats — tenant-scoped read for authenticated role
CREATE POLICY "authenticated_select_product_epc_stats"
  ON public.product_epc_stats
  FOR SELECT
  TO authenticated
  USING (site_id = (current_setting('request.jwt.claims', true)::json ->> 'site_id')::uuid);

-- S11-009a: subject_objections — tenant-scoped read for authenticated role
CREATE POLICY "authenticated_select_subject_objections"
  ON public.subject_objections
  FOR SELECT
  TO authenticated
  USING (site_id = (current_setting('request.jwt.claims', true)::json ->> 'site_id')::uuid);

-- S11-009b: access_review_log — read-only for any authenticated user
-- (no site_id column; this is a global audit trail for site admins)
CREATE POLICY "authenticated_select_access_review_log"
  ON public.access_review_log
  FOR SELECT
  TO authenticated
  USING (true);
