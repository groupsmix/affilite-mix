-- Rollback 2026052303: Drop concurrent indexes
-- supabase:no-transaction
DROP INDEX CONCURRENTLY IF EXISTS idx_products_id_site_id;
DROP INDEX CONCURRENTLY IF EXISTS idx_admin_users_email_lower;
DROP INDEX CONCURRENTLY IF EXISTS idx_sites_domain;
