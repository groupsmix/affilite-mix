-- Rollback: 2026062003_commissions_dedup_hardening (Bug 6)
--
-- Restore the original partial dedup index and drop the NOT NULL constraint.
-- The 'legacy_'-prefixed order_ids backfilled by the forward migration are left
-- in place (they are valid, unique values); reverting them to NULL is neither
-- necessary nor safely reversible.

ALTER TABLE public.commissions
  ALTER COLUMN order_id DROP NOT NULL;

DROP INDEX IF EXISTS public.idx_commissions_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_dedup
  ON public.commissions (network, order_id) WHERE order_id IS NOT NULL;
