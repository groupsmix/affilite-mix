-- DB-11: Standardize money columns.
--
-- Problem: Three storage shapes for money:
--   * products.price TEXT (free-form, e.g. "$149", "Free to join")
--   * products.price_amount NUMERIC (no precision)
--   * commissions.commission_amount NUMERIC(12,2)
--
-- Fix:
--   * Rename price -> price_label (display-only)
--   * Retype price_amount to NUMERIC(12,2)
--   * Add CHECK constraint
--
-- This migration is idempotent: column renames use IF EXISTS guards.

DO $$
BEGIN
  -- Rename price -> price_label if not already renamed
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'price'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'price_label'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN price TO price_label;
    COMMENT ON COLUMN public.products.price_label IS
      'DB-11: Display-only price text (e.g. "$149", "Free to join"). For calculations use price_amount + price_currency.';
  END IF;

  -- Retype price_amount to NUMERIC(12,2) if it exists without precision
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name = 'price_amount'
      AND (numeric_precision IS NULL OR numeric_scale IS NULL OR numeric_scale != 2)
  ) THEN
    ALTER TABLE public.products
      ALTER COLUMN price_amount TYPE NUMERIC(12,2);
  END IF;

  -- Add non-negative check if not already present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'chk_products_price_amount_nonneg'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT chk_products_price_amount_nonneg
      CHECK (price_amount IS NULL OR price_amount >= 0);
  END IF;
END $$;
