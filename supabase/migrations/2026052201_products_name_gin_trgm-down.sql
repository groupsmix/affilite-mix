-- Rollback 2026052201: Drop trigram GIN index on products.name
DROP INDEX IF EXISTS idx_products_name_gin;
-- NOTE: pg_trgm extension is NOT dropped because other migrations or
-- queries may depend on it.
