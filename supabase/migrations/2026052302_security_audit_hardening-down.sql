-- Rollback: Security Audit Hardening
-- WARNING: Dropping the version column discards optimistic locking state.

DROP INDEX CONCURRENTLY IF EXISTS idx_admin_users_email_lower;
DROP INDEX CONCURRENTLY IF EXISTS idx_products_id_site_id;
ALTER TABLE products DROP COLUMN IF EXISTS version;
