-- AUD-06 / TASK-004b: Restrict RBAC metadata tables to authenticated users.
--
-- roles, permissions, role_permissions, and integration_providers previously
-- had `USING (true)` SELECT policies that exposed the full RBAC schema to
-- unauthenticated clients using the anon key. Internal audit verification
-- confirmed that no public route queries these tables - they are only used
-- from admin-guarded routes.
--
-- This migration replaces the permissive `USING (true)` policies with
-- `TO authenticated USING (true)` so only logged-in users can read them.

-- ── roles ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "roles_public_read" ON roles;
CREATE POLICY "roles_authenticated_read" ON roles
  FOR SELECT TO authenticated USING (true);

-- ── permissions ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "permissions_public_read" ON permissions;
CREATE POLICY "permissions_authenticated_read" ON permissions
  FOR SELECT TO authenticated USING (true);

-- ── role_permissions ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "role_permissions_public_read" ON role_permissions;
CREATE POLICY "role_permissions_authenticated_read" ON role_permissions
  FOR SELECT TO authenticated USING (true);

-- ── integration_providers ──────────────────────────────────────────────
DROP POLICY IF EXISTS "integration_providers_public_read" ON integration_providers;
CREATE POLICY "integration_providers_authenticated_read" ON integration_providers
  FOR SELECT TO authenticated USING (true);
