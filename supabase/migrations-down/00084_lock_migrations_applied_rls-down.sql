-- Down migration for 00084_lock_migrations_applied_rls.sql
-- Restores the wide-open authenticated policy that 00064 originally
-- emitted. Only run as a last-resort revert; this re-introduces the
-- ledger-poisoning vector flagged in audit item S-09.

DO $$
BEGIN
  IF to_regclass('public._migrations_applied') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS _migrations_applied_service_all ON public._migrations_applied';
    EXECUTE 'GRANT  SELECT, INSERT, UPDATE, DELETE ON public._migrations_applied TO authenticated, anon';
    EXECUTE $POLICY$
      CREATE POLICY tenant_isolation_auth_global__migrations_applied
        ON public._migrations_applied
        FOR ALL
        TO authenticated
        USING (true)
        WITH CHECK (true)
    $POLICY$;
  END IF;
END;
$$;
