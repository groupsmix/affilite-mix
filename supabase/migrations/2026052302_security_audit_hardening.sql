-- Migration: Security Audit Hardening (Audits 17-30)
--
-- ISO18-001: Add optimistic locking version column to products
-- A17-002: Covering index for authz resource lookup (index-only scan)
-- A17-003: Case-insensitive index on admin_users.email
--
-- Safe operations only:
--   ✅ ADD COLUMN (nullable with default — no table lock on PG 11+)
--   ✅ CREATE INDEX CONCURRENTLY (no table lock)

-- ISO18-001: Optimistic locking — prevents lost updates from concurrent edits.
-- Default 1 so existing rows start at version 1 without a backfill step.
ALTER TABLE products ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- A17-002: Covering index so `authorizeResource` can do an index-only scan
-- instead of fetching the heap page for site_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_id_site_id
  ON products(id) INCLUDE (site_id);

-- A17-003: Case-insensitive unique index on admin email. Prevents duplicate
-- accounts differing only in case and allows the login query to use
-- LOWER(email) = LOWER($1) efficiently.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_users_email_lower
  ON admin_users(LOWER(email));
