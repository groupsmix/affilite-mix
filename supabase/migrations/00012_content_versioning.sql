-- Migration: Add body_previous column to content table for version history
-- Stores the previous version of the body when content is updated,
-- enabling simple "undo last edit" functionality.

ALTER TABLE content
  ADD COLUMN IF NOT EXISTS body_previous text DEFAULT NULL;

COMMENT ON COLUMN content.body_previous IS 'Stores the previous version of body HTML for simple undo/version history';
