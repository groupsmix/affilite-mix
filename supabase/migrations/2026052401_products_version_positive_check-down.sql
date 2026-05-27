-- Rollback 2026052401: Remove version positive check constraint
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_products_version_positive;
