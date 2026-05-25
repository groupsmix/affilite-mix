-- Migration: Add index on ai_drafts(site_id, created_at DESC) for efficient listing
-- Audit: A5-001 — Missing EXPLAIN/index proof
-- Standard: CWE-400

-- Drop the index if it exists
DROP INDEX IF EXISTS idx_ai_drafts_site_created;

-- Also drop filtered status indexes if they were created
DROP INDEX IF EXISTS idx_ai_drafts_site_status_created;
