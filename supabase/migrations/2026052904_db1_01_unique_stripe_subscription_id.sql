-- ============================================================
-- Migration 2026052904: DB1-01 — UNIQUE on memberships.stripe_subscription_id
--
-- A single Stripe subscription must map to exactly one membership row.
-- Without this constraint, concurrent or replayed webhooks could
-- insert duplicate rows for the same subscription, leading to
-- double-billing or orphaned records.
--
-- The constraint is partial (WHERE stripe_subscription_id IS NOT NULL)
-- because memberships created before Stripe checkout have NULL values.
-- The existing non-unique index idx_memberships_stripe_sub is replaced
-- by this unique index.
-- ============================================================

-- Drop the old non-unique index first (idempotent).
DROP INDEX IF EXISTS idx_memberships_stripe_sub;

-- Add a unique partial index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_stripe_sub_unique
  ON memberships (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
