-- Rollback: 2026062002_widen_memberships_status_check (Bug 1)
--
-- Restore the original (narrower) status domain that excludes 'disputed'.
-- NOTE: this will fail if any memberships row currently holds status =
-- 'disputed'. That is intentional — you must reconcile those rows (e.g. map
-- them back to 'past_due') before narrowing the constraint again.

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_status_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_status_check
  CHECK (status IN ('active', 'cancelled', 'expired', 'past_due'));
