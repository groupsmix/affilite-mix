-- ═══════════════════════════════════════════════════════
-- Migration 00039: Drop legacy public SELECT policies left behind by 00035
-- ═══════════════════════════════════════════════════════
--
-- Migration 00001 originally created public SELECT policies with
-- human-readable names ("Public can read active products", "Public can
-- read published content", etc). Migrations 00024, 00031, and 00035
-- replaced most of these with `public_read_*` policies and then dropped
-- the `public_read_*` versions — but migration 00035 did NOT drop the
-- two surviving legacy names on `products` and `content`. The policies
-- are effectively dead code because migration 00035 also did
-- `REVOKE SELECT … FROM anon` on both tables (anon cannot exercise a
-- policy on a table it has no SELECT grant on), but carrying dead
-- SELECT policies makes future audits noisier than necessary and risks
-- silently re-opening access if GRANT SELECT is ever restored.
--
-- Fix: drop the two legacy policies so the post-00035 "Option B: anon
-- has zero read access to tenant tables" state is expressed cleanly in
-- both GRANTs *and* policy catalog.
--
-- Safe to re-run: DROP POLICY IF EXISTS is idempotent.
-- ═══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Public can read active products"   ON products;

DROP POLICY IF EXISTS "Public can read published content" ON content;

-- Belt-and-suspenders: keep the explicit anon SELECT REVOKE from 00035
-- asserted on both tables. REVOKE on a privilege that is not granted is
-- a no-op, so this is safe to re-state.
REVOKE SELECT ON products FROM anon;

REVOKE SELECT ON content  FROM anon;
