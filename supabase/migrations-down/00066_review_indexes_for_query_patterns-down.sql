-- Rollback for 00066_review_indexes_for_query_patterns.sql
DROP INDEX IF EXISTS idx_price_alerts_product_target;
DROP INDEX IF EXISTS idx_content_site_status_created;
DROP INDEX IF EXISTS idx_products_active_deal_expires;
DROP INDEX IF EXISTS idx_products_site_status_created;
DROP INDEX IF EXISTS idx_sites_domain;
