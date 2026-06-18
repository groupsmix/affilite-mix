-- Rollback: 2026061701_seed_static_sites
--
-- Removes the four static-config sites that were seeded by the up-migration.
-- Safe to run only when these sites have no dependent data (products, articles,
-- clicks, etc.). If a site has already been used, deactivate it via
-- `UPDATE sites SET is_active = false WHERE slug = '...'` instead of deleting.
DELETE FROM sites
WHERE slug IN ('ai-compared', 'arabic-tools', 'crypto-tools', 'watch-tools');
