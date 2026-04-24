-- Migration: Expand sites table for zero-touch niche platform
-- Adds monetization, theming, navigation, features, SEO, social links,
-- and custom CSS columns so launching a new niche requires zero code changes.

-- Monetization
ALTER TABLE sites ADD COLUMN IF NOT EXISTS monetization_type text DEFAULT 'affiliate'
  CHECK (monetization_type IN ('affiliate', 'ads', 'both'));
ALTER TABLE sites ADD COLUMN IF NOT EXISTS est_revenue_per_click numeric DEFAULT 0.35;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS ad_config jsonb DEFAULT '{}';

-- Theming
ALTER TABLE sites ADD COLUMN IF NOT EXISTS theme jsonb DEFAULT '{}';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS favicon_url text;

-- Navigation
ALTER TABLE sites ADD COLUMN IF NOT EXISTS nav_items jsonb DEFAULT '[]';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS footer_nav jsonb DEFAULT '[]';

-- Features
ALTER TABLE sites ADD COLUMN IF NOT EXISTS features jsonb
  DEFAULT '{"newsletter": true, "giftFinder": false, "search": true}';

-- SEO
ALTER TABLE sites ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS meta_description text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS og_image_url text;

-- Social links
ALTER TABLE sites ADD COLUMN IF NOT EXISTS social_links jsonb DEFAULT '{}';

-- Custom CSS overrides

-- Timestamps
ALTER TABLE sites ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_sites_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sites_updated_at ON sites;
CREATE TRIGGER sites_updated_at
  BEFORE UPDATE ON sites
  FOR EACH ROW EXECUTE FUNCTION update_sites_updated_at();
