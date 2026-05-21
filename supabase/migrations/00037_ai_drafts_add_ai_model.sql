-- Add ai_model column to ai_drafts so each draft records the specific model
-- that produced it (not just the provider). Existing rows default to ''.
ALTER TABLE ai_drafts
  ADD COLUMN IF NOT EXISTS ai_model text NOT NULL DEFAULT '';
