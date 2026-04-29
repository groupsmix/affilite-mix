-- Reverse: rename price_label back to price, remove check constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price_label'
  ) THEN
    ALTER TABLE public.products RENAME COLUMN price_label TO price;
  END IF;
  ALTER TABLE public.products DROP CONSTRAINT IF EXISTS chk_products_price_amount_nonneg;
END $$;
