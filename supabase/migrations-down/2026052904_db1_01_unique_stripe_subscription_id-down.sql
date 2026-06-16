-- ============================================================
-- Rollback 2026052904: DB1-01 — revert UNIQUE on stripe_subscription_id
-- ============================================================

DROP INDEX IF EXISTS idx_memberships_stripe_sub_unique;

-- Restore the original non-unique index.
CREATE INDEX IF NOT EXISTS idx_memberships_stripe_sub
  ON memberships (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
