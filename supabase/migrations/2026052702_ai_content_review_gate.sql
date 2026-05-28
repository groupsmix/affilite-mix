-- SEC-13: AI content auto-publish human-review gate.
-- AI-generated content must be reviewed by a human before it can be
-- auto-published by the cron. The publish cron skips rows where
-- ai_generated = true AND human_reviewed_at IS NULL.

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_reviewed_at TIMESTAMPTZ;

COMMENT ON COLUMN content.ai_generated
  IS 'SEC-13: true when this row was created or substantially edited by an AI pipeline';

COMMENT ON COLUMN content.human_reviewed_at
  IS 'SEC-13: timestamp of most recent human editorial review; must be non-null for AI content to auto-publish';
