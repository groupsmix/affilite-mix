-- Reverse of 00088: drop the erasure RPC and revert the widened CHECK
-- constraints back to their pre-DB-16 shape.
--
-- NB: reverting will fail if any rows currently use the new status
-- values ('erased' on newsletter_subscribers, 'deleted' on comments).
-- The operator must clean those rows up first; that is the same
-- constraint that applies to any narrowing CHECK change.

DROP FUNCTION IF EXISTS public.erase_user(text);

DO $$
BEGIN
  IF to_regclass('public.comments') IS NOT NULL THEN
    ALTER TABLE public.comments
      DROP CONSTRAINT IF EXISTS comments_status_check;
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'spam'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    ALTER TABLE public.newsletter_subscribers
      DROP CONSTRAINT IF EXISTS newsletter_subscribers_status_check;
    ALTER TABLE public.newsletter_subscribers
      ADD CONSTRAINT newsletter_subscribers_status_check
      CHECK (status IN ('pending', 'active', 'unsubscribed'));
  END IF;
END $$;
