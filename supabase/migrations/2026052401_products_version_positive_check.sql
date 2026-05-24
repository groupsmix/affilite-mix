-- Audit SC-004 / MG: ensure products.version stays positive even on direct SQL.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_products_version_positive'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT chk_products_version_positive CHECK (version > 0);
  END IF;
END $$;
