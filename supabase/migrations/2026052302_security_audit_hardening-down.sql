-- Rollback: Security Audit Hardening
-- WARNING: Dropping the version column discards optimistic locking state.

DROP TRIGGER IF EXISTS trg_products_increment_version ON products;
DROP FUNCTION IF EXISTS products_increment_version();
DROP FUNCTION IF EXISTS increment_login_failed_attempts(UUID, INT, BIGINT);
DROP INDEX CONCURRENTLY IF EXISTS idx_admin_users_email_lower;
DROP INDEX CONCURRENTLY IF EXISTS idx_products_id_site_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_products_site_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_products_category_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_products_site_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_products_site_status_created;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_events_created_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_events_site_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_audit_events_entity;
DROP INDEX CONCURRENTLY IF EXISTS idx_admin_site_memberships_user;
DROP INDEX CONCURRENTLY IF EXISTS idx_admin_site_memberships_site;
DROP INDEX CONCURRENTLY IF EXISTS idx_sites_domain;
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_status;
ALTER TABLE products DROP COLUMN IF EXISTS version;
