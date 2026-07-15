-- ============================================================
-- Migration 2026071501: Gift Finder multi-dimensional tagging
-- ============================================================
-- A product can now be tagged against multiple categories
-- (occasion + recipient + style) so the gift-finder quiz can
-- surface products that match every dimension, instead of being
-- constrained by the single legacy category_id.

-- 1. Add category_ids array to products.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS category_ids UUID[] DEFAULT '{}';

-- Index for `category_ids && '{...}'` overlap queries used by
-- gift-finder and admin filters.
CREATE INDEX IF NOT EXISTS idx_products_category_ids
  ON public.products USING gin(category_ids);

-- 2. Backfill existing products: promote the legacy category_id
-- into the new array when it is not already present.
UPDATE public.products
SET category_ids = ARRAY[category_id]
WHERE category_id IS NOT NULL
  AND (category_ids IS NULL OR category_ids = '{}');

-- 3. Allow category.taxonomy_type to be "style" — the missing
-- dimension used by the gift-finder quiz.
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_taxonomy_type_check,
  ADD CONSTRAINT categories_taxonomy_type_check
  CHECK (taxonomy_type IN ('general', 'budget', 'occasion', 'recipient', 'brand', 'style'));
