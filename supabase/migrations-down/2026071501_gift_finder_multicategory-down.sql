-- Down migration for 2026071501_gift_finder_multicategory

-- 1. Revert taxonomy_type check constraint to the pre-style set.
ALTER TABLE public.categories
  DROP CONSTRAINT IF EXISTS categories_taxonomy_type_check,
  ADD CONSTRAINT categories_taxonomy_type_check
  CHECK (taxonomy_type IN ('general', 'budget', 'occasion', 'recipient', 'brand'));

-- 2. Drop the GIN index and category_ids column.
DROP INDEX IF EXISTS public.idx_products_category_ids;

ALTER TABLE public.products
  DROP COLUMN IF EXISTS category_ids;
