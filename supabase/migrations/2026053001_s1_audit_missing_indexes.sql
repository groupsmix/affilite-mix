-- supabase:no-transaction
--
-- Tier-2 audit Finding #5: this file uses CREATE INDEX CONCURRENTLY, which cannot
-- run inside a transaction block. The Supabase runner wraps migrations in a
-- transaction by default, so without this directive (a regression of the
-- 2026052303 split) applying this file aborts. The directive applies the file
-- outside a transaction.
--
-- S1-A16-007: Add index on commissions.click_id for reconciliation lookups.
-- Without this, commission reconciliation queries by click_id cause full scans.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_commissions_click_id
  ON commissions (click_id)
  WHERE click_id IS NOT NULL;

-- S1-A17-003: Add pg_trgm GIN index on products.name for ILIKE search performance.
-- Leading-wildcard ILIKE queries ('%term%') cannot use standard B-tree indexes.
-- pg_trgm GIN indexes support these queries efficiently.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_trgm
  ON products USING gin (name gin_trgm_ops);
