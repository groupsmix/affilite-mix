-- Rollback: S1-A16-007 + S1-A17-003 indexes
DROP INDEX IF EXISTS idx_commissions_click_id;
DROP INDEX IF EXISTS idx_products_name_trgm;
-- Note: pg_trgm extension is not dropped as other indexes may depend on it.
