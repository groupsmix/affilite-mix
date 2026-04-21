-- ═══════════════════════════════════════════════════════
-- Migration 00035: Admin site memberships
-- ═══════════════════════════════════════════════════════
--
-- Adds admin_site_memberships to control which admin users can access
-- which sites.  super_admin users bypass this check in application code
-- but are still seeded with memberships for completeness.
--
-- Regular admins MUST have a membership row for a site to select it or
-- perform admin operations on it.  This closes the tenant-isolation gap
-- where any authenticated admin could switch to any site via the cookie.
--
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_site_memberships (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (admin_user_id, site_id)
);

CREATE INDEX IF NOT EXISTS idx_admin_site_memberships_user
  ON admin_site_memberships(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_site_memberships_site
  ON admin_site_memberships(site_id);

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE admin_site_memberships ENABLE ROW LEVEL SECURITY;

-- Only the service role (used by the app's DAL) may read/write memberships.
-- No anon or authenticated access.
CREATE POLICY "admin_site_memberships_service_all"
  ON admin_site_memberships
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Seed: grant every existing admin access to every existing site ───
-- This is safe for bootstrapping: existing deployments had no tenant
-- isolation, so all admins already had implicit access to all sites.
-- After this migration, new admins must be explicitly granted membership.
INSERT INTO admin_site_memberships (admin_user_id, site_id)
SELECT au.id, s.id
FROM admin_users au
CROSS JOIN sites s
WHERE au.is_active = true
ON CONFLICT (admin_user_id, site_id) DO NOTHING;
