-- Reverse: This is a data-migration; cannot fully reverse the backfill.
-- Re-create the dropped indexes for rollback safety.
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON public.audit_log(actor);
