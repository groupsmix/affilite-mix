-- Down migration for 00082_lock_security_definer_search_path.sql
--
-- Reverts the search_path pin and restores PUBLIC EXECUTE on every
-- SECURITY DEFINER function in the public schema. This re-opens the
-- privesc primitive flagged by the audit and the advisor — only run
-- as a last-resort emergency revert.

DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.prosecdef
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
  LOOP
    -- Best-effort: ALTER FUNCTION RESET search_path drops only the
    -- pin we added. Pre-existing pins (e.g. apply_stripe_membership_event)
    -- already had `search_path=public, pg_temp` and will be reset; we
    -- accept that as a known down-migration artefact.
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) RESET search_path',
        f.proname, f.args
      );
    EXCEPTION WHEN OTHERS THEN
      -- Swallow: function may have been dropped or altered concurrently.
      NULL;
    END;

    IF f.prosecdef THEN
      BEGIN
        EXECUTE format(
          'GRANT EXECUTE ON FUNCTION public.%I(%s) TO PUBLIC',
          f.proname, f.args
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;
END;
$$;
