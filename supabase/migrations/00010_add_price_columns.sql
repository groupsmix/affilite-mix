-- Migration: Add price_amount and price_currency columns to products table
-- TypeScript types, product form, gift finder API, and product card all reference
-- these fields but they are missing from the products table schema.

ALTER TABLE products ADD COLUMN IF NOT EXISTS price_amount numeric;
ALTER TABLE products ADD COLUMN IF NOT EXISTS price_currency text DEFAULT 'USD';
