-- Down migration for 00084_extend_retention_purge.sql
-- Restores the 00077 three-table form. Only the down path; the up
-- path is a `CREATE OR REPLACE` so re-applying 00077 would overwrite
-- this anyway.

CREATE OR REPLACE FUNCTION public.purge_retention()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  clicks_count integer;
  audit_count integer;
  stripe_count integer;
  result jsonb;
BEGIN
  DELETE FROM affiliate_clicks WHERE created_at < now() - INTERVAL '365 days';
  GET DIAGNOSTICS clicks_count = ROW_COUNT;

  DELETE FROM audit_log WHERE created_at < now() - INTERVAL '365 days';
  GET DIAGNOSTICS audit_count = ROW_COUNT;

  DELETE FROM stripe_events WHERE received_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS stripe_count = ROW_COUNT;

  result := jsonb_build_object(
    'affiliate_clicks_deleted', clicks_count,
    'audit_log_deleted',        audit_count,
    'stripe_events_deleted',    stripe_count
  );
  RETURN result;
END $$;
