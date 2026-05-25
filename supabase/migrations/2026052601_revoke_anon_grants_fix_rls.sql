-- ══════════════════════════════════════════════════════════════════
-- Migration 2026052601: Revoke all unexpected anon grants + harden
-- RLS on tables added by recent migrations (A31-A44, OF-02–OF-16).
--
-- Problem (RLS audit E-6, Invariant A):
--   Every table created without an explicit REVOKE inherits the
--   Supabase default `GRANT ALL ON ALL TABLES IN SCHEMA public TO anon`
--   from the project template. This migration:
--
--   1. Revokes ALL grants from anon on every public-schema table that
--      still holds them.
--   2. Re-grants only SELECT on the 7 explicitly public-facing tables
--      (sites, categories, products, content, pages, content_products,
--      ad_placements).
--   3. Enables RLS on new tables missing it (cron_state, consent_log,
--      webhook_dlq).
--   4. Adds service_role-only policies on new tables that had RLS
--      enabled but no policy (stripe_event_failures, cron_state,
--      consent_log, webhook_dlq).
--
-- Idempotent: all statements are guarded with IF NOT EXISTS / IF EXISTS
-- / dynamic revoke (no-op when the grant was already removed).
-- ══════════════════════════════════════════════════════════════════

-- ── Step 1: Revoke ALL grants from anon on all public-schema tables ──
-- Run dynamically so this also catches any future tables accidentally
-- created with default grants before a dedicated hardening migration lands.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT DISTINCT table_name
    FROM information_schema.role_table_grants
    WHERE grantee = 'anon' AND table_schema = 'public'
  ) LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.table_name);
  END LOOP;
END $$;

-- ── Step 2: Re-grant SELECT on the 7 public-facing tables ────────────
-- These tables carry RLS policies (public_read_sites, etc.) that restrict
-- rows to active/published records only. The anon DAL client
-- (getAnonClient()) reads through these policies for public page rendering.
GRANT SELECT ON public.sites            TO anon;
GRANT SELECT ON public.categories       TO anon;
GRANT SELECT ON public.products         TO anon;
GRANT SELECT ON public.content          TO anon;
GRANT SELECT ON public.pages            TO anon;
GRANT SELECT ON public.content_products TO anon;
GRANT SELECT ON public.ad_placements    TO anon;

-- ── Step 3: Enable RLS on new tables that are missing it ─────────────
-- cron_state (OF-16: added by 2026050104_cron_state.sql, no ENABLE RLS)
DO $$ BEGIN
  IF to_regclass('public.cron_state') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.cron_state ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- consent_log (OF-04: added by 2026050106_consent_log.sql, no ENABLE RLS)
DO $$ BEGIN
  IF to_regclass('public.consent_log') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.consent_log ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- webhook_dlq (R2-02: added by 2026052203_webhook_dlq.sql, no ENABLE RLS)
DO $$ BEGIN
  IF to_regclass('public.webhook_dlq') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.webhook_dlq ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- ── Step 4: Add service_role-only policies on new tables ─────────────
-- stripe_event_failures: RLS enabled in 2026052202 but no policy added.
DO $$ BEGIN
  IF to_regclass('public.stripe_event_failures') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'stripe_event_failures' AND policyname = 'stripe_event_failures_service_only'
  ) THEN
    EXECUTE $P$
      CREATE POLICY stripe_event_failures_service_only
        ON public.stripe_event_failures FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $P$;
  END IF;
END $$;

-- cron_state
DO $$ BEGIN
  IF to_regclass('public.cron_state') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'cron_state' AND policyname = 'cron_state_service_only'
  ) THEN
    EXECUTE $P$
      CREATE POLICY cron_state_service_only
        ON public.cron_state FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $P$;
  END IF;
END $$;

-- consent_log
DO $$ BEGIN
  IF to_regclass('public.consent_log') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'consent_log' AND policyname = 'consent_log_service_only'
  ) THEN
    EXECUTE $P$
      CREATE POLICY consent_log_service_only
        ON public.consent_log FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $P$;
  END IF;
END $$;

-- webhook_dlq
DO $$ BEGIN
  IF to_regclass('public.webhook_dlq') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'webhook_dlq' AND policyname = 'webhook_dlq_service_only'
  ) THEN
    EXECUTE $P$
      CREATE POLICY webhook_dlq_service_only
        ON public.webhook_dlq FOR ALL TO service_role
        USING (true) WITH CHECK (true)
    $P$;
  END IF;
END $$;
