-- ═══════════════════════════════════════════════════════════════════════════
-- CRITICAL SCHEMA RECONCILIATION MIGRATION
-- ═══════════════════════════════════════════════════════════════════════════
-- This migration reconciles the database schema with runtime code expectations.
-- It addresses all schema drift issues identified in the pre-launch audit.
--
-- BLOCKER FIXES:
-- 1. Audit log schema alignment (actor, entity_type, ip columns)
-- 2. Sites table completeness verification
-- 3. Ad impressions atomic upsert support
-- 4. Newsletter subscribers unsubscribe token verification
--
-- This migration is IDEMPOTENT and safe to run multiple times.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. AUDIT LOG SCHEMA ALIGNMENT ──────────────────────────────────────────
-- The DAL expects actor, entity_type, and ip columns but the base schema
-- only defines action, entity, entity_id, details, and timestamps.

ALTER TABLE audit_log 
  ADD COLUMN IF NOT EXISTS actor uuid REFERENCES admin_users(id) ON DELETE SET NULL;

ALTER TABLE audit_log 
  ADD COLUMN IF NOT EXISTS entity_type text;

ALTER TABLE audit_log 
  ADD COLUMN IF NOT EXISTS ip inet;

-- Add index for actor lookups (used in admin audit log filtering)
CREATE INDEX IF NOT EXISTS idx_audit_log_actor 
  ON audit_log(actor) 
  WHERE actor IS NOT NULL;

-- Add index for entity_type filtering
CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type 
  ON audit_log(site_id, entity_type, created_at DESC) 
  WHERE entity_type IS NOT NULL;

-- ── 2. SITES TABLE VERIFICATION ────────────────────────────────────────────
-- Verify is_active column exists (should be added by migration 00011)
-- This is defensive; the column should already exist.

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sites' 
    AND column_name = 'is_active'
  ) THEN
    ALTER TABLE sites ADD COLUMN is_active boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- ── 3. AD IMPRESSIONS ATOMIC UPSERT SUPPORT ────────────────────────────────
-- Add unique constraint to enable ON CONFLICT upserts for atomic impression
-- counting. This prevents race conditions under concurrent traffic.

-- First, ensure we have all required columns
ALTER TABLE ad_impressions 
  ADD COLUMN IF NOT EXISTS content_id uuid REFERENCES content(id) ON DELETE SET NULL;

-- Create unique constraint for atomic upserts
-- This allows: INSERT ... ON CONFLICT (site_id, ad_placement_id, content_id, page_path, impression_date) DO UPDATE
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_impressions_unique_daily 
  ON ad_impressions(site_id, ad_placement_id, COALESCE(content_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(page_path, ''), impression_date);

-- Add columns for CPM revenue tracking (if not already present)
ALTER TABLE ad_impressions 
  ADD COLUMN IF NOT EXISTS cpm_revenue_cents integer DEFAULT 0;

ALTER TABLE ad_impressions 
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now();

-- Rename 'count' to 'impression_count' for clarity (if needed)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ad_impressions' 
    AND column_name = 'count'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'ad_impressions' 
    AND column_name = 'impression_count'
  ) THEN
    ALTER TABLE ad_impressions RENAME COLUMN count TO impression_count;
  END IF;
END $$;

-- ── 4. NEWSLETTER SUBSCRIBERS VERIFICATION ─────────────────────────────────
-- Verify unsubscribe_token exists (should be added by migration 00030)

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'newsletter_subscribers' 
    AND column_name = 'unsubscribe_token'
  ) THEN
    ALTER TABLE newsletter_subscribers 
      ADD COLUMN unsubscribe_token uuid UNIQUE DEFAULT gen_random_uuid();
    
    CREATE UNIQUE INDEX idx_newsletter_subscribers_unsubscribe_token
      ON newsletter_subscribers (unsubscribe_token)
      WHERE unsubscribe_token IS NOT NULL;
    
    -- Backfill tokens for existing rows
    UPDATE newsletter_subscribers
      SET unsubscribe_token = gen_random_uuid()
      WHERE unsubscribe_token IS NULL;
  END IF;
END $$;

-- ── 5. VERIFY ANALYTICS RPC FUNCTIONS EXIST ────────────────────────────────
-- These should exist from migration 00006, but verify they're present

DO $$ 
BEGIN
  -- Verify get_top_products exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_top_products'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: get_top_products RPC function is missing. Migration 00006 may not have run.';
  END IF;

  -- Verify get_top_referrers exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_top_referrers'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: get_top_referrers RPC function is missing. Migration 00006 may not have run.';
  END IF;

  -- Verify get_top_content_slugs exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_top_content_slugs'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: get_top_content_slugs RPC function is missing. Migration 00006 may not have run.';
  END IF;

  -- Verify get_daily_clicks exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'get_daily_clicks'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: get_daily_clicks RPC function is missing. Migration 00006 may not have run.';
  END IF;
END $$;

-- ── 6. VERIFY CRITICAL TABLES EXIST ────────────────────────────────────────

DO $$ 
BEGIN
  -- Verify ad_placements exists (from migration 00015)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ad_placements'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: ad_placements table is missing. Migration 00015 may not have run.';
  END IF;

  -- Verify ad_impressions exists (from migration 00017)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ad_impressions'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: ad_impressions table is missing. Migration 00017 may not have run.';
  END IF;

  -- Verify ai_drafts exists (from migration 00029)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'ai_drafts'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: ai_drafts table is missing. Migration 00029 may not have run.';
  END IF;

  -- Verify affiliate_networks exists (from migration 00029)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'affiliate_networks'
  ) THEN
    RAISE EXCEPTION 'CRITICAL: affiliate_networks table is missing. Migration 00029 may not have run.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION COMPLETE
-- ═══════════════════════════════════════════════════════════════════════════
-- This migration has:
-- ✓ Added missing audit_log columns (actor, entity_type, ip)
-- ✓ Verified sites.is_active exists
-- ✓ Added atomic upsert support for ad_impressions
-- ✓ Verified newsletter_subscribers.unsubscribe_token exists
-- ✓ Verified all analytics RPC functions exist
-- ✓ Verified all critical tables exist
--
-- Next steps:
-- 1. Run: supabase db reset (to verify clean migration replay)
-- 2. Run: npm run db:types (to regenerate TypeScript types)
-- 3. Run integration tests for audit logging, impressions, and newsletter
-- ═══════════════════════════════════════════════════════════════════════════
