-- ═══════════════════════════════════════════════════════
-- HISTORICAL ONE-OFF: Change domains from .site to .xyz
--
-- Kept for reference only. This is NOT a migration and is NOT
-- applied by `supabase db push` — forward migrations live under
-- `supabase/migrations/` and are numbered sequentially.
--
-- Was run once in the Supabase SQL Editor when domains were
-- renamed. Do not re-run on existing deployments.
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- STEP 1: Update main domains to .xyz
-- ═══════════════════════════════════════════════════════

UPDATE sites SET domain = 'wristnerd.xyz' WHERE slug = 'watch-tools';
UPDATE sites SET domain = 'arabictools.wristnerd.xyz' WHERE slug = 'arabic-tools';

-- ═══════════════════════════════════════════════════════
-- STEP 2: Flexible Domain System (Dashboard Managed)
-- ═══════════════════════════════════════════════════════
-- 
-- You can now add MULTIPLE domains to the same site!
-- Just insert into site_domains table:
--
--   INSERT INTO site_domains (site_id, domain, is_primary)
--   VALUES ('<site-uuid>', 'crypto.wristnerd.xyz', false);
--
-- Or use cryptoranked.xyz for crypto-tools:
--
--   INSERT INTO site_domains (site_id, domain, is_primary)
--   SELECT id, 'cryptoranked.xyz', true FROM sites WHERE slug = 'crypto-tools';

-- Verify the changes
SELECT slug, name, domain, is_active 
FROM sites 
WHERE slug IN ('watch-tools', 'arabic-tools', 'crypto-tools');

-- Show all domains (if using site_domains extension table)
-- SELECT s.slug, s.name, sd.domain, sd.is_primary 
-- FROM sites s 
-- LEFT JOIN site_domains sd ON s.id = sd.site_id;
