-- Rollback 00095: Drop apply_stripe_membership_event function
-- NOTE: This drops the RPC entirely. Callers must be updated if rolling back.
DROP FUNCTION IF EXISTS public.apply_stripe_membership_event(TEXT, TEXT, JSONB);
