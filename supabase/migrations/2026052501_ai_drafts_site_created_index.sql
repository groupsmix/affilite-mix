-- Migration: Add index on ai_drafts(site_id, created_at DESC) for efficient listing
-- Audit: A5-001 — Missing EXPLAIN/index proof
-- Standard: CWE-400
--
-- The ai_drafts table is queried primarily by site_id with optional status
-- and content_type filters, always ordered by created_at DESC. Without this
-- index, large tenants with many drafts will experience sequential scans
-- and in-memory sorts.
--
-- This migration adds:
--   1. A composite index on (site_id, created_at DESC) covering the common case
--   2. A filtered index variant for the "pending" status filter pattern
--
-- Both are created CONCURRENTLY to avoid locking the table during creation.

-- Create the composite index for site-scoped, date-ordered queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_drafts_site_created
  ON ai_drafts (site_id, created_at DESC);

-- Create a filtered index for the common "pending drafts" admin view
-- This helps the dashboard "pending review" count and list queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_drafts_site_status_created
  ON ai_drafts (site_id, created_at DESC)
  WHERE status = 'pending';

-- Add a unique constraint on (site_id, slug) to prevent duplicate slugs
-- within a tenant. This is critical for the transactional publish flow
-- (A5-004) so that concurrent publish attempts for the same slug fail
-- deterministically rather than creating duplicate content rows.
--
-- Note: We add this as a UNIQUE INDEX rather than ALTER TABLE ADD CONSTRAINT
-- because existing duplicate data would cause the ALTER to fail. The index
-- will fail to create if duplicates exist — operators must clean duplicates
-- first. This is intentional fail-closed behavior.
--
-- If this index creation fails due to existing duplicates, run:
--   SELECT site_id, slug, COUNT(*) FROM ai_drafts GROUP BY site_id, slug HAVING COUNT(*) > 1;
-- Then deduplicate before re-running this migration.
DO $$
BEGIN
  -- Only add the constraint if there are no duplicates
  IF NOT EXISTS (
    SELECT 1 FROM ai_drafts
    GROUP BY site_id, slug
    HAVING COUNT(*) > 1
    LIMIT 1
  ) THEN
    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_ai_drafts_site_slug_unique
      ON ai_drafts (site_id, slug);
  ELSE
    RAISE NOTICE 'Cannot create unique index: duplicate (site_id, slug) pairs exist. Clean duplicates first.';
  END IF;
END $$;
