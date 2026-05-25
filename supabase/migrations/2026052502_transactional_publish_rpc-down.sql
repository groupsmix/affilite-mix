-- Rollback: Drop the transactional publish RPC
-- Audit: A5-004 — Race condition on draft publish

DROP FUNCTION IF EXISTS publish_ai_draft(UUID, UUID, TEXT);
