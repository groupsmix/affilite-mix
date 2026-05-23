-- Migration: Security Audit Hardening (Audits A86-A115)
--
-- ISO18-001: Add optimistic locking version column to products
-- R10-004: Atomic login_failed_attempts increment function
-- SC16-004: Performance indexes for products table
-- SC16-005: CHECK constraint on products.status
-- SC16-006: Case-insensitive unique index on admin_users.email
-- A17-002: Covering index for authz resource lookup (index-only scan)
--
-- Safe operations only:
--   ✅ ADD COLUMN (nullable with default — no table lock on PG 11+)
--   ✅ CREATE INDEX CONCURRENTLY (no table lock)
--   ✅ CREATE OR REPLACE FUNCTION (no lock)

-- ============================================================================
-- ISO18-001: Optimistic locking — prevents lost updates from concurrent edits.
-- Default 1 so existing rows start at version 1 without a backfill step.
-- ============================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- ISO18-001: Auto-increment version on every UPDATE via trigger.
-- This ensures version is ALWAYS incremented server-side, preventing the
-- "version reset to 1" bug (A97 CVE-2026-XXXX) when clients omit version.
CREATE OR REPLACE FUNCTION products_increment_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_increment_version ON products;
CREATE TRIGGER trg_products_increment_version
  BEFORE UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION products_increment_version();

-- ============================================================================
-- R10-004: Atomic login_failed_attempts increment to prevent race condition
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_login_failed_attempts(
  user_id UUID,
  lockout_threshold INT DEFAULT 10,
  lockout_duration_ms BIGINT DEFAULT 3600000
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
  new_attempts INT;
  is_locked BOOLEAN := FALSE;
BEGIN
  UPDATE admin_users
  SET login_failed_attempts = login_failed_attempts + 1,
      login_locked_until = CASE
        WHEN login_failed_attempts + 1 >= lockout_threshold
        THEN NOW() + (lockout_duration_ms || ' milliseconds')::INTERVAL
        ELSE login_locked_until
      END
  WHERE id = user_id
  RETURNING login_failed_attempts, (login_failed_attempts >= lockout_threshold) INTO new_attempts, is_locked;

  RETURN json_build_object('attempts', new_attempts, 'locked', is_locked);
END;
$$;

-- ============================================================================
-- SC16-004: Performance indexes for products table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_products_site_id ON products(site_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_site_status ON products(site_id, status);
CREATE INDEX IF NOT EXISTS idx_products_site_status_created ON products(site_id, status, created_at DESC);

-- A17-002: Covering index so `authorizeResource` can do an index-only scan
-- instead of fetching the heap page for site_id.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_id_site_id
  ON products(id) INCLUDE (site_id);

-- ============================================================================
-- SC16-005: CHECK constraint on products.status
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_status'
  ) THEN
    ALTER TABLE products ADD CONSTRAINT chk_products_status
      CHECK (status IN ('draft', 'active', 'archived'));
  END IF;
END $$;

-- ============================================================================
-- SC16-006: Unique constraint on admin_users email (case-insensitive)
-- ============================================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_admin_users_email_lower
  ON admin_users(LOWER(email));

-- ============================================================================
-- SC16-007: Indexes for audit_events table
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_site_id ON audit_events(site_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);

-- ============================================================================
-- Additional: Indexes for admin_site_memberships
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_admin_site_memberships_user ON admin_site_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_site_memberships_site ON admin_site_memberships(site_id);

-- ============================================================================
-- Additional: Unique index on sites.domain
-- ============================================================================
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_sites_domain ON sites(domain) WHERE domain IS NOT NULL;
