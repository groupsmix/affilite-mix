-- ============================================================
-- Migration 2026062002: Widen memberships.status CHECK to allow 'disputed' (Bug 1)
-- ============================================================
--
-- Problem (webhook 500 on charge disputes):
--   00051_memberships.sql defines an inline CHECK on memberships.status that
--   allows only ('active','cancelled','expired','past_due'). The Stripe event
--   processor (lib/stripe-event-processor.ts, A169-02) intentionally writes
--   status = 'disputed' on a charge.dispute.created event for a clear audit
--   trail. That write violates the CHECK (SQLSTATE 23514) and the webhook
--   handler returns 500, sending the event to the DLQ.
--
-- Fix:
--   Replace the constraint with one that also permits 'disputed'.
--
--   Constraint name: the column-level CHECK in 00051 is unnamed, so PostgreSQL
--   auto-names it using the conventional `<table>_<column>_check` form,
--   i.e. `memberships_status_check`. DROP ... IF EXISTS keeps this re-runnable.
--
-- Backward-compatible: only widens the allowed set; every previously-valid row
-- remains valid. Deploy alongside or before the webhook code.
-- ============================================================

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_status_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_status_check
  CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'disputed'));
