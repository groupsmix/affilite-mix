-- Replace coarse monetization_type enum with a fine-grained modules array.
-- Keeps the old column for backward compatibility during migration.

-- Add the new monetization_modules column (JSONB array of module strings)
ALTER TABLE sites
  ADD COLUMN IF NOT EXISTS monetization_modules JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Backfill from existing monetization_type values
UPDATE sites SET monetization_modules = CASE
  WHEN monetization_type = 'affiliate' THEN '["affiliate_links"]'::jsonb
  WHEN monetization_type = 'ads'       THEN '["display_ads"]'::jsonb
  WHEN monetization_type = 'both'      THEN '["affiliate_links","display_ads"]'::jsonb
  ELSE '[]'::jsonb
END
WHERE monetization_modules = '[]'::jsonb;

-- Add a comment explaining the migration plan
COMMENT ON COLUMN sites.monetization_modules IS
  'Fine-grained monetization modules: affiliate_links, display_ads, newsletter_sponsor, lead_gen, paid_membership, price_alerts, sponsored_reviews. Replaces the coarse monetization_type enum.';

COMMENT ON COLUMN sites.monetization_type IS
  'DEPRECATED — use monetization_modules instead. Kept for backward compatibility during migration.';
