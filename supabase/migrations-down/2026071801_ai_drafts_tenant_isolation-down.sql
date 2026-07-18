-- Revert the tenant-isolation policy added in 2026071801.
-- The previous state was service_role-only access, so authenticated site
-- access is removed by dropping this policy.
drop policy if exists tenant_isolation_auth_ai_drafts on public.ai_drafts;
