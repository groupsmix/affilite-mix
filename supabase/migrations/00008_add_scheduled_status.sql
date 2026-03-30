-- Migration: Add 'scheduled' to content status CHECK constraint
-- The content table CHECK constraint only allows ('draft', 'review', 'published', 'archived')
-- but the application code extensively uses 'scheduled' for scheduled publishing.

ALTER TABLE content DROP CONSTRAINT IF EXISTS content_status_check;
ALTER TABLE content ADD CONSTRAINT content_status_check
  CHECK (status IN ('draft', 'review', 'published', 'scheduled', 'archived'));
