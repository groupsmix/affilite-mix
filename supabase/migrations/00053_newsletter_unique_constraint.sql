-- Migration: Add unique constraint on newsletter_subscribers (site_id, email)
-- F-016: Prevents duplicate email signups per site at the database level.
-- This complements the application-level dedup check and provides
-- definitive protection against race conditions.

-- Add partial unique index (only for pending/active subscribers, not unsubscribed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_unique_pending
  ON newsletter_subscribers (site_id, email)
  WHERE status IN ('pending', 'active');

-- Also add a nullable unique index on email alone for unsubscribe lookups
-- This allows multiple sites to have the same email but ensures per-site uniqueness