-- ═══════════════════════════════════════════════════════
-- Migration 00040: Add missing service_role policies (defense-in-depth)
-- ═══════════════════════════════════════════════════════
--
-- Audit finding: ten tables in the public schema have RLS enabled but
-- zero policies.  With no policies and RLS enabled the default-deny
-- behaviour blocks anon/authenticated roles entirely, and service_role
-- continues to bypass RLS -- so these tables are secure in practice.
-- However every other internal/admin table already carries an explicit
-- `*_service_all` policy that documents the intent, and
-- docs/public-rls-inventory.md lists these tables as holding such a
-- policy.  Add them now so prod policy definitions match the repo
-- documentation.
--
-- Tables covered:
--   admin_users, sites, site_modules, site_feature_flags, roles,
--   permissions, role_permissions, user_site_roles,
--   integration_providers, site_integrations
--
-- Safety: every statement is idempotent (DROP POLICY IF EXISTS +
-- CREATE POLICY).  Adding a service_role policy changes no effective
-- access because service_role already bypasses RLS.
-- ═══════════════════════════════════════════════════════

-- admin_users
DROP POLICY IF EXISTS "admin_users_service_all" ON admin_users;
CREATE POLICY "admin_users_service_all" ON admin_users
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- sites
DROP POLICY IF EXISTS "sites_service_all" ON sites;
CREATE POLICY "sites_service_all" ON sites
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- site_modules
DROP POLICY IF EXISTS "site_modules_service_all" ON site_modules;
CREATE POLICY "site_modules_service_all" ON site_modules
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- site_feature_flags
DROP POLICY IF EXISTS "site_feature_flags_service_all" ON site_feature_flags;
CREATE POLICY "site_feature_flags_service_all" ON site_feature_flags
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- roles
DROP POLICY IF EXISTS "roles_service_all" ON roles;
CREATE POLICY "roles_service_all" ON roles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- permissions
DROP POLICY IF EXISTS "permissions_service_all" ON permissions;
CREATE POLICY "permissions_service_all" ON permissions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- role_permissions
DROP POLICY IF EXISTS "role_permissions_service_all" ON role_permissions;
CREATE POLICY "role_permissions_service_all" ON role_permissions
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- user_site_roles
DROP POLICY IF EXISTS "user_site_roles_service_all" ON user_site_roles;
CREATE POLICY "user_site_roles_service_all" ON user_site_roles
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- integration_providers
DROP POLICY IF EXISTS "integration_providers_service_all" ON integration_providers;
CREATE POLICY "integration_providers_service_all" ON integration_providers
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- site_integrations
DROP POLICY IF EXISTS "site_integrations_service_all" ON site_integrations;
CREATE POLICY "site_integrations_service_all" ON site_integrations
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
