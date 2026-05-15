-- A28: Global TIMESTAMPTZ enforcement.
--
-- Ensures all timestamp columns use TIMESTAMPTZ to avoid time zone ambiguity
-- and potential audit log tampering or scheduling inconsistencies.

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Audit all public tables for 'timestamp without time zone' (TIMESTAMP)
    FOR r IN (
        SELECT table_schema, table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type = 'timestamp without time zone'
    ) LOOP
        RAISE NOTICE 'A28: Converting %.%.% to TIMESTAMPTZ', r.table_schema, r.table_name, r.column_name;
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I TYPE TIMESTAMPTZ',
            r.table_schema, r.table_name, r.column_name);
    END LOOP;
END $$;
