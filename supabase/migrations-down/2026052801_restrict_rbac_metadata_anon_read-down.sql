-- Rollback: restore the original public-read policies for RBAC metadata tables.

DROP POLICY IF EXISTS "roles_authenticated_read" ON roles;
CREATE POLICY "roles_public_read" ON roles FOR SELECT USING (true);

DROP POLICY IF EXISTS "permissions_authenticated_read" ON permissions;
CREATE POLICY "permissions_public_read" ON permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "role_permissions_authenticated_read" ON role_permissions;
CREATE POLICY "role_permissions_public_read" ON role_permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "integration_providers_authenticated_read" ON integration_providers;
CREATE POLICY "integration_providers_public_read" ON integration_providers FOR SELECT USING (true);
