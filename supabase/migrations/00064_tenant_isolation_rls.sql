DO $$
DECLARE
  t text;
  has_site_id boolean;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'site_id'
    ) INTO has_site_id;

    IF has_site_id THEN
      EXECUTE format('
        CREATE POLICY "tenant_isolation_auth_%s" ON %I
        FOR ALL TO authenticated
        USING (
          (current_setting(''request.jwt.claims'', true)::json->>''site_id'') IS NULL
          OR
          (current_setting(''request.jwt.claims'', true)::json->>''site_id'') = site_id::text
        )
        WITH CHECK (
          (current_setting(''request.jwt.claims'', true)::json->>''site_id'') IS NULL
          OR
          (current_setting(''request.jwt.claims'', true)::json->>''site_id'') = site_id::text
        );
      ', t, t);
    ELSE
      -- Tables without site_id (e.g. sites, admin_users) are global.
      EXECUTE format('
        CREATE POLICY "tenant_isolation_auth_global_%s" ON %I
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true);
      ', t, t);
    END IF;
  END LOOP;
END;
$$;
