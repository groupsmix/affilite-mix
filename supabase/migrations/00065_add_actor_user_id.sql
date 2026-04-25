-- F-045: Add typed actor_user_id column to audit_log for reliable joins
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS actor_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user_id ON audit_log(actor_user_id);
