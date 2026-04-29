-- Down migration for 00080_stripe_events_created_at.sql
-- Reverts the new column and its index. Any retention/reconciliation code
-- that started using `created_at` will need to fall back to `received_at`
-- before this is run.

DROP INDEX IF EXISTS public.idx_stripe_events_created_at;

ALTER TABLE public.stripe_events
  DROP COLUMN IF EXISTS created_at;
