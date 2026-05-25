-- Rollback: 2026052601_revoke_anon_grants_fix_rls
-- WARNING: This restores the previous (less restrictive) grant posture.
-- Only run this if you need to revert the security hardening migration.

-- ── Step 1: Drop service_role-only policies added in Step 4 ──────────
DROP POLICY IF EXISTS webhook_dlq_service_only ON public.webhook_dlq;
DROP POLICY IF EXISTS consent_log_service_only ON public.consent_log;
DROP POLICY IF EXISTS cron_state_service_only ON public.cron_state;
DROP POLICY IF EXISTS stripe_event_failures_service_only ON public.stripe_event_failures;

-- ── Step 2: Disable RLS on tables enabled in Step 3 ──────────────────
-- (Only if these tables exist — they may not in all environments)
DO $$ BEGIN
  IF to_regclass('public.webhook_dlq') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.webhook_dlq DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.consent_log') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.consent_log DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.cron_state') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.cron_state DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ── Step 3: Restore default anon grants (Supabase template default) ──
-- This re-grants ALL to anon on all public tables, reverting the lockdown.
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon;
