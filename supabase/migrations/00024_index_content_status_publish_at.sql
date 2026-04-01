-- Finding 5: Add composite index on (status, publish_at) for scheduled publishing cron.
-- The cron job queries WHERE status = 'scheduled' AND publish_at <= NOW() across all sites.
-- This index is more efficient than the existing (site_id, status) index for that cross-site query.

CREATE INDEX IF NOT EXISTS idx_content_status_publish_at
  ON content (status, publish_at)
  WHERE status = 'scheduled';
