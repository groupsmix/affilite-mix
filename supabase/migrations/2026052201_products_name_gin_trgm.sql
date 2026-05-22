-- D-02: Add trigram GIN index for fast ILIKE searches on products.name
-- This allows leading-wildcard ILIKE patterns to use an index scan instead of seq scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_gin
  ON products USING gin (name gin_trgm_ops);
