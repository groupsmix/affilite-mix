-- Migration: Split CREATE INDEX CONCURRENTLY into non-transactional file
--
-- Audit A1-A30 recommendation #1:
-- CREATE INDEX CONCURRENTLY cannot run inside a transaction block.
-- Supabase migrations run each file in a transaction by default.
-- By isolating concurrent indexes in their own migration file and using
-- the `-- supabase:no-transaction` directive, they execute correctly.
--
-- supabase:no-transaction

-- A17-002: Covering index so `authorizeResource` can do an index-only scan
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_id_site_id
  ON products(id) INCLUDE (site_id);

-- SC16-006: Unique constraint on admin_users email (case-insensitive)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_users_email_lower
  ON admin_users(LOWER(email));

-- Unique index on sites.domain
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_sites_domain
  ON sites(domain) WHERE domain IS NOT NULL;
