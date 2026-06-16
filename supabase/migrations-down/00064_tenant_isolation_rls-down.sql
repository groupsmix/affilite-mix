-- 00064_tenant_isolation_rls-down
--
-- Drop the per-table tenant_isolation_auth_<t> and
-- tenant_isolation_auth_global_<t> policies emitted by the forward
-- migration. Safe to run on environments that have already been
-- hardened by 00067; that migration drops the global_* policies on its
-- own and replaces tenant_isolation_auth_<t> with the locked-down
-- variant, so DROP IF EXISTS is a no-op for those rows.

DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
      'tenant_isolation_auth_' || t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
      'tenant_isolation_auth_global_' || t, t);
  END LOOP;
END;
$$;
