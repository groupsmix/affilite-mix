-- A28: Global TIMESTAMPTZ enforcement.
--
-- Ensures all timestamp columns use TIMESTAMPTZ to avoid time zone ambiguity
-- and potential audit log tampering or scheduling inconsistencies.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Audit only base tables in public schema for timestamp without time zone
    FOR r IN (
        SELECT c.table_schema, c.table_name, c.column_name
        FROM information_schema.columns c
        JOIN information_schema.tables t
          ON t.table_schema = c.table_schema
         AND t.table_name = c.table_name
        WHERE c.table_schema = 'public'
          AND c.data_type = 'timestamp without time zone'
          AND t.table_type = 'BASE TABLE'
    ) LOOP
        RAISE NOTICE 'A28: Converting %.%.% to TIMESTAMPTZ', r.table_schema, r.table_name, r.column_name;
        EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING (%I AT TIME ZONE ''UTC'')',
            r.table_schema, r.table_name, r.column_name, r.column_name
        );
    END LOOP;
END $$;
