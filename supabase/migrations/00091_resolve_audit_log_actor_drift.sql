-- DB-06: Resolve audit_log.actor schema drift.
--
-- Problem: actor is TEXT (legacy from 00003); 00041 intended to convert
-- it to uuid but IF NOT EXISTS no-op'd. 00065 added a parallel
-- actor_user_id UUID REFERENCES admin_users(id). Two columns claim to
-- identify the actor.
--
-- Fix: Backfill actor_user_id from actor where parseable as UUID,
-- drop the legacy trigram and btree indexes on actor, then drop actor
-- after a deprecation window.
--
-- Phase 1 (this migration): backfill + drop indexes.
-- Phase 2 (future): drop the actor column after verifying no code reads it.

-- Backfill actor_user_id from actor where it looks like a UUID
UPDATE public.audit_log
SET    actor_user_id = actor::uuid
WHERE  actor_user_id IS NULL
  AND  actor IS NOT NULL
  AND  actor ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Drop the redundant indexes on the legacy actor TEXT column
DROP INDEX IF EXISTS idx_audit_log_actor_trgm;
DROP INDEX IF EXISTS idx_audit_log_actor;

COMMENT ON COLUMN public.audit_log.actor IS
  'DEPRECATED (DB-06): Legacy TEXT actor column. Use actor_user_id instead. Will be dropped in a future migration.';
