-- Security Audit Remediation Migration
-- Fixes: R10-004 (race condition), SC16-004 (indexes), SC16-005 (constraints), SC16-006 (unique email)
-- Date: 2026-05-23

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
  lockout_until TIMESTAMPTZ;
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email_lower ON admin_users(LOWER(email));

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_domain ON sites(domain) WHERE domain IS NOT NULL;
