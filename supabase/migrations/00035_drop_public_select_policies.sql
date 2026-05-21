-- ═══════════════════════════════════════════════════════
-- Migration 00037: Drop all public/anon SELECT policies
-- ═══════════════════════════════════════════════════════
--
-- History: This file was originally authored as migration 00035 alongside
-- 00035_admin_site_memberships.sql.  The duplicate prefix was a hygiene
-- bug; the file was renumbered to 00037 (following tip migration 00036)
-- with no change to the policy body.  Because `DROP POLICY IF EXISTS`
-- and `REVOKE` are idempotent, re-application (or first application) is
-- safe regardless of whether the original 00035_ file was recorded in
-- the `_migrations_applied` ledger.
-- ═══════════════════════════════════════════════════════
--
-- Strategy: Option B — move public reads fully behind server-side API.
--
-- The anon Supabase client (NEXT_PUBLIC_SUPABASE_ANON_KEY) has zero
-- browser importers.  Every public-facing read already goes through
-- server-side DAL functions that use getServiceClient() or
-- getAnonClient() from lib/supabase-server.ts.  This migration:
--
--   1. Drops all 7 public SELECT policies so the anon key returns
--      zero rows from every tenant-scoped table.
--   2. REVOKEs SELECT on each table from the anon role as belt-and-
--      suspenders — even without policies, RLS default-deny would
--      block reads, but an explicit REVOKE makes the intent
--      unmistakable and survives a future accidental
--      ALTER TABLE … DISABLE ROW LEVEL SECURITY.
--   3. Drops the ad_placements_public_read policy which was the only
--      public SELECT policy that did NOT gate on site.is_active.
--
-- Kept intentionally:
--   - public_insert_ad_impressions (ad_impressions) — no server-side
--     endpoint equivalent yet.
--   - web_vitals_anon_insert (web_vitals) — hardened by CHECK
--     constraints in migration 00033.
--
-- All DAL functions that previously used getAnonClient() are updated
-- in the same PR to use getServiceClient() instead.
--
-- Safe to re-run: DROP POLICY IF EXISTS + REVOKE are idempotent.
-- ═══════════════════════════════════════════════════════

-- ── 1. Drop public SELECT policies ─────────────────────────────────

-- sites
DROP POLICY IF EXISTS "public_read_sites" ON sites;

-- categories
DROP POLICY IF EXISTS "public_read_categories" ON categories;

-- products
DROP POLICY IF EXISTS "public_read_active_products" ON products;

-- content
DROP POLICY IF EXISTS "public_read_published_content" ON content;

-- pages
DROP POLICY IF EXISTS "public_read_published_pages" ON pages;

-- content_products
DROP POLICY IF EXISTS "public_read_content_products" ON content_products;

-- ad_placements
DROP POLICY IF EXISTS "ad_placements_public_read" ON ad_placements;

-- ── 2. REVOKE SELECT from anon on tenant-scoped tables ─────────────
--    Belt-and-suspenders: even without policies RLS default-deny
--    blocks reads, but REVOKE survives accidental RLS disable.

REVOKE SELECT ON sites             FROM anon;
REVOKE SELECT ON categories        FROM anon;
REVOKE SELECT ON products          FROM anon;
REVOKE SELECT ON content           FROM anon;
REVOKE SELECT ON pages             FROM anon;
REVOKE SELECT ON content_products  FROM anon;
REVOKE SELECT ON ad_placements     FROM anon;
