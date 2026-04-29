-- Down migration for 00081_rls_initplan_optimisation.sql
--
-- Unwraps `(select auth.<x>())` and `(select current_request_site_id*())`
-- back to the bare form. Only intended for the unlikely case that the
-- wrapped form regresses Postgres' planner on a future minor upgrade.
-- The bare form is the unsafe pre-S-07 state and re-introduces the
-- per-row evaluation cost the up-migration removed.

CREATE OR REPLACE FUNCTION pg_temp.__unwrap_initplan(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text := input;
BEGIN
  IF result IS NULL THEN
    RETURN NULL;
  END IF;
  result := regexp_replace(result, '\(select (auth\.[a-z_]+\(\))\)',           '\1', 'g');
  result := regexp_replace(result, '\(select (current_request_site_ids?\(\))\)','\1', 'g');
  RETURN result;
END;
$$;

DO $$
DECLARE
  pol RECORD;
  new_qual text;
  new_check text;
  roles_clause text;
  policy_sql text;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname, cmd, roles, permissive, qual, with_check
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  (
              (qual       IS NOT NULL AND qual       ~ '\(select (auth\.[a-z_]+\(\)|current_request_site_ids?\(\))\)')
           OR (with_check IS NOT NULL AND with_check ~ '\(select (auth\.[a-z_]+\(\)|current_request_site_ids?\(\))\)')
           )
  LOOP
    new_qual  := pg_temp.__unwrap_initplan(pol.qual);
    new_check := pg_temp.__unwrap_initplan(pol.with_check);

    IF (new_qual  IS NOT DISTINCT FROM pol.qual)
   AND (new_check IS NOT DISTINCT FROM pol.with_check) THEN
      CONTINUE;
    END IF;

    roles_clause := array_to_string(
      ARRAY(SELECT quote_ident(r) FROM unnest(pol.roles) AS r),
      ', '
    );

    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    policy_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      pol.policyname, pol.schemaname, pol.tablename,
      pol.permissive, pol.cmd, roles_clause
    );
    IF new_qual  IS NOT NULL THEN policy_sql := policy_sql || format(' USING (%s)', new_qual); END IF;
    IF new_check IS NOT NULL THEN policy_sql := policy_sql || format(' WITH CHECK (%s)', new_check); END IF;
    EXECUTE policy_sql;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS pg_temp.__unwrap_initplan(text);
