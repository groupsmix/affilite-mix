-- F-DB-03: Atomic data retention purge function.
-- Wraps all retention deletes in a single transaction so partial failures
-- don't leave the DB in an inconsistent state.

CREATE OR REPLACE FUNCTION public.purge_retention()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    'audit_log_deleted', audit_count,
    'stripe_events_deleted', stripe_count
  );

  RETURN result;
END $$;

COMMENT ON FUNCTION public.purge_retention() IS
  'F-DB-03: Atomic GDPR data retention purge — deletes expired rows from affiliate_clicks (365d), audit_log (365d), and stripe_events (90d) in a single transaction.';
