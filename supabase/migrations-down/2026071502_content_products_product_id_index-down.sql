-- Rollback 2026071502: drop the content_products(product_id) index.
-- DROP INDEX CONCURRENTLY avoids an ACCESS EXCLUSIVE lock on the table and,
-- like the forward migration, cannot run inside a transaction block.
-- supabase:no-transaction
DROP INDEX CONCURRENTLY IF EXISTS idx_content_products_product_id;
