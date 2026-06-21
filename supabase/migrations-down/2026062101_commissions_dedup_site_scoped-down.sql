-- Rollback: 2026062101_commissions_dedup_site_scoped
--
-- Restore the full (network, order_id) unique dedup index (the state created by
-- 2026062003_commissions_dedup_hardening). NOTE: if any cross-tenant rows sharing
-- the same (network, order_id) were inserted while the site-scoped index was in
-- effect, this revert will fail on the duplicate — resolve those rows first.

DROP INDEX IF EXISTS public.idx_commissions_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_dedup
  ON public.commissions (network, order_id);
