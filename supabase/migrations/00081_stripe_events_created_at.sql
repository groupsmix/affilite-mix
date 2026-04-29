-- ═══════════════════════════════════════════════════════════════════
-- Migration 00081 (audit S-06): add `created_at` to public.stripe_events
-- ═══════════════════════════════════════════════════════════════════
--
-- Background
-- ----------
-- The Supabase audit (S-06, P0) flagged that `select max(created_at)
-- from public.stripe_events` errors with `column does not exist`, even
-- though the data-retention cron (`/api/cron/data-retention`) and a
-- handful of reconciliation queries reference the column. The table
-- (created in 00054_stripe_events.sql) only carries
-- `(stripe_event_id, event_type, received_at)`; `created_at` was
-- dropped from that initial migration but never reintroduced.
--
-- This migration adds the column idempotently, backfills it from
-- `received_at` for existing rows, and adds a btree index so the
-- retention purge / reconciliation lookups stay sargable.
--
-- Forward-compat: anything written by `applyStripeEventAtomic` /
-- `recordStripeEvent` after this migration applies will inherit the
-- DEFAULT now() — no client change required.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, COALESCE-safe backfill,
-- CREATE INDEX IF NOT EXISTS.
--
-- Rollback: see 00081_stripe_events_created_at-down.sql.

ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill existing rows from received_at so the new column is never
-- NULL even on the brief window between ALTER and the next webhook.
UPDATE public.stripe_events
SET    created_at = received_at
WHERE  created_at IS DISTINCT FROM received_at
  AND  received_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stripe_events_created_at
  ON public.stripe_events (created_at);

COMMENT ON COLUMN public.stripe_events.created_at IS
  'Server-side timestamp of when the row was inserted. Distinct from received_at (Stripe webhook arrival time). Used by purge_retention() and reconciliation queries (audit S-06).';
