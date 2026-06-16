-- Down migration for 00070_atomic_stripe_event_apply.sql
--
-- After dropping the function, callers fall back to the pre-migration
-- (non-atomic) recordStripeEvent + processStripeEvent pair.

DROP FUNCTION IF EXISTS public.apply_stripe_membership_event(TEXT, TEXT, JSONB);
