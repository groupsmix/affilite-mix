-- Make the catalog price snapshot job idempotent across cron retries.
ALTER TABLE public.price_snapshots
  ADD COLUMN IF NOT EXISTS snapshot_date DATE;

UPDATE public.price_snapshots
SET snapshot_date = (scraped_at AT TIME ZONE 'UTC')::date
WHERE snapshot_date IS NULL;

ALTER TABLE public.price_snapshots
  ALTER COLUMN snapshot_date SET DEFAULT ((now() AT TIME ZONE 'UTC')::date);

ALTER TABLE public.price_snapshots
  ALTER COLUMN snapshot_date SET NOT NULL;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY site_id, product_id, source, snapshot_date
      ORDER BY scraped_at DESC, created_at DESC, id DESC
    ) AS duplicate_rank
  FROM public.price_snapshots
)
DELETE FROM public.price_snapshots snapshots
USING ranked
WHERE snapshots.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_price_snapshots_daily_dedup
  ON public.price_snapshots (site_id, product_id, source, snapshot_date);
