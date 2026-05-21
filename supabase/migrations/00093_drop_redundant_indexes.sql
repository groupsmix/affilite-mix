-- DB-12: Drop redundant single-column indexes that shadow existing
-- composite unique constraints.
--
-- These single-column btree indexes are made redundant by UNIQUE
-- constraints whose leading column already serves the equality scan:
--   * idx_admin_users_email → shadowed by UNIQUE(email)
--   * idx_categories_site → shadowed by UNIQUE(site_id, slug)
--   * idx_products_site → shadowed by UNIQUE(site_id, slug)
--   * idx_content_site → shadowed by UNIQUE(site_id, slug)
--   * idx_pages_site → shadowed by UNIQUE(site_id, slug)
--
-- Verify usage via pg_stat_user_indexes before applying in production.

DROP INDEX IF EXISTS idx_admin_users_email;
DROP INDEX IF EXISTS idx_categories_site;
DROP INDEX IF EXISTS idx_products_site;
DROP INDEX IF EXISTS idx_products_site_slug;
DROP INDEX IF EXISTS idx_content_site;
DROP INDEX IF EXISTS idx_content_site_slug;
DROP INDEX IF EXISTS idx_pages_site;
DROP INDEX IF EXISTS idx_pages_site_slug;
DROP INDEX IF EXISTS idx_quizzes_site;
DROP INDEX IF EXISTS idx_experiments_site;
