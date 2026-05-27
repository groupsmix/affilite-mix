-- Rollback 2026052701: Remove template/card-style columns from sites and niche_templates
ALTER TABLE niche_templates DROP COLUMN IF EXISTS product_card_style;
ALTER TABLE niche_templates DROP COLUMN IF EXISTS homepage_template;
ALTER TABLE sites DROP COLUMN IF EXISTS product_card_style;
ALTER TABLE sites DROP COLUMN IF EXISTS homepage_template;
