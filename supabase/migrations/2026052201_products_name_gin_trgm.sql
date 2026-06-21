-- supabase:no-transaction
--
-- Tier-2 audit Finding #5: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, and the Supabase runner wraps each migration in one by
-- default. This directive (matching 2026052303) makes the runner apply this
-- file outside a transaction so the concurrent index build below succeeds.
--
-- D-02: Add trigram GIN index for fast ILIKE searches on products.name
-- This allows leading-wildcard ILIKE patterns to use an index scan instead of seq scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_name_gin
  ON products USING gin (name gin_trgm_ops);
