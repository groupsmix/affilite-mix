-- Migration: Add taxonomy_type column to categories table
-- Run this on existing databases that already have the categories table.
-- For new databases, schema.sql already includes taxonomy_type.

-- Add column with default 'general' (backward compatible)
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS taxonomy_type text NOT NULL DEFAULT 'general'
  CHECK (taxonomy_type IN ('general', 'budget', 'occasion', 'recipient', 'brand'));

-- Add index for taxonomy-filtered queries
CREATE INDEX IF NOT EXISTS idx_categories_taxonomy ON categories(site_id, taxonomy_type);

-- Seed watch-tools taxonomy categories (only if watch-tools site exists)
-- Budget categories
WITH watch AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, description, taxonomy_type)
SELECT id, name, slug, description, taxonomy_type FROM (
  VALUES
    ('Under $100', 'under-100', 'Great starter watches under $100', 'budget'),
    ('Under $200', 'under-200', 'Sweet spot for gift watches under $200', 'budget'),
    ('Under $300', 'under-300', 'Premium quality watches under $300', 'budget'),
    ('Under $500', 'under-500', 'Luxury territory watches under $500', 'budget'),
    ('$500+', 'luxury-500-plus', 'The best of the best — luxury watches $500 and up', 'budget')
) AS v(name, slug, description, taxonomy_type)
CROSS JOIN watch
ON CONFLICT (site_id, slug) DO UPDATE SET taxonomy_type = EXCLUDED.taxonomy_type;

-- Occasion categories
WITH watch AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, description, taxonomy_type)
SELECT id, name, slug, description, taxonomy_type FROM (
  VALUES
    ('Father''s Day', 'fathers-day', 'Perfect watches for Father''s Day gifts', 'occasion'),
    ('Christmas', 'christmas', 'Top watch picks for Christmas gifting', 'occasion'),
    ('Birthday', 'birthday', 'Birthday-worthy watches for every budget', 'occasion'),
    ('Valentine''s Day', 'valentines-day', 'Romantic watch gifts for Valentine''s Day', 'occasion'),
    ('Anniversary', 'anniversary', 'Celebrate milestones with a timeless watch', 'occasion'),
    ('Graduation', 'graduation', 'Mark the achievement with a graduation watch', 'occasion')
) AS v(name, slug, description, taxonomy_type)
CROSS JOIN watch
ON CONFLICT (site_id, slug) DO UPDATE SET taxonomy_type = EXCLUDED.taxonomy_type;

-- Recipient categories
WITH watch AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, description, taxonomy_type)
SELECT id, name, slug, description, taxonomy_type FROM (
  VALUES
    ('For Him', 'for-him', 'Watch gift guides curated for men', 'recipient'),
    ('For Her', 'for-her', 'Watch gift guides curated for women', 'recipient'),
    ('For Teens', 'for-teens', 'Stylish and affordable watches for teenagers', 'recipient')
) AS v(name, slug, description, taxonomy_type)
CROSS JOIN watch
ON CONFLICT (site_id, slug) DO UPDATE SET taxonomy_type = EXCLUDED.taxonomy_type;

-- Brand categories
WITH watch AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, description, taxonomy_type)
SELECT id, name, slug, description, taxonomy_type FROM (
  VALUES
    ('Seiko', 'seiko', 'Seiko watches — Japanese craftsmanship since 1881', 'brand'),
    ('Orient', 'orient', 'Orient watches — affordable mechanical excellence', 'brand'),
    ('Tissot', 'tissot', 'Tissot watches — Swiss precision since 1853', 'brand'),
    ('Hamilton', 'hamilton', 'Hamilton watches — American heritage, Swiss made', 'brand'),
    ('Casio', 'casio', 'Casio watches — innovation and durability', 'brand')
) AS v(name, slug, description, taxonomy_type)
CROSS JOIN watch
ON CONFLICT (site_id, slug) DO UPDATE SET taxonomy_type = EXCLUDED.taxonomy_type;
