-- Migration: Add image_alt column to products table
-- This column stores descriptive alt text for product images,
-- improving accessibility (WCAG 2.1 AA) and SEO.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_alt text DEFAULT '';

COMMENT ON COLUMN products.image_alt IS 'Descriptive alt text for the product image (accessibility & SEO)';
