-- Rollback: 2026071504_price_snapshots_daily_idempotency
--
-- Removes the retry-safe daily dedup key and restores the previous schema shape.
-- Snapshot rows inserted while the unique key was active remain as ordinary
-- historical rows after rollback.

DROP INDEX IF EXISTS public.idx_price_snapshots_daily_dedup;

ALTER TABLE public.price_snapshots
  ALTER COLUMN snapshot_date DROP NOT NULL,
  ALTER COLUMN snapshot_date DROP DEFAULT;

ALTER TABLE public.price_snapshots
  DROP COLUMN IF EXISTS snapshot_date;
