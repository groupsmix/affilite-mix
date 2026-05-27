-- Migration: Add homepage_template and product_card_style to sites table
-- Extends per-site template system so each site can choose its own
-- landing page layout and product card presentation without code changes.

-- homepage_template: which homepage layout component to render
-- Values: 'standard' (default grid), 'cinematic' (hero+editorial),
--         'minimal' (clean/centered), 'editorial' (magazine grid),
--         'top10' (numbered list)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS homepage_template TEXT
  NOT NULL DEFAULT 'standard'
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10'));

-- product_card_style: which product card variant to use across the site
-- Values: 'standard' (current default card), 'compact' (horizontal/row),
--         'detailed' (expanded with pros/cons inline)
ALTER TABLE sites ADD COLUMN IF NOT EXISTS product_card_style TEXT
  NOT NULL DEFAULT 'standard'
  CHECK (product_card_style IN ('standard', 'compact', 'detailed'));

-- Also add these to niche_templates so templates can set default layouts
ALTER TABLE niche_templates ADD COLUMN IF NOT EXISTS homepage_template TEXT
  NOT NULL DEFAULT 'standard'
  CHECK (homepage_template IN ('standard', 'cinematic', 'minimal', 'editorial', 'top10'));

ALTER TABLE niche_templates ADD COLUMN IF NOT EXISTS product_card_style TEXT
  NOT NULL DEFAULT 'standard'
  CHECK (product_card_style IN ('standard', 'compact', 'detailed'));
