-- Rollback: 2026071504_price_snapshots_daily_idempotency

DROP INDEX IF EXISTS public.idx_price_snapshots_daily_dedup;

ALTER TABLE public.price_snapshots
  DROP COLUMN IF EXISTS snapshot_date;
