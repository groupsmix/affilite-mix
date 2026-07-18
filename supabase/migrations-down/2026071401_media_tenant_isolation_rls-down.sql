-- Down migration for 2026071401_media_tenant_isolation_rls.sql
-- Removes the authenticated tenant-isolation policy and revokes the
-- table grants, returning `media` to service_role-only access.

DROP POLICY IF EXISTS tenant_isolation_auth_media ON public.media;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.media FROM authenticated;
