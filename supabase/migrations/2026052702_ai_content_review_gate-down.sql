-- SEC-13 rollback: remove AI content review gate columns.
ALTER TABLE content
  DROP COLUMN IF EXISTS human_reviewed_at,
  DROP COLUMN IF EXISTS ai_generated;
