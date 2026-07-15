-- A32 / DB-2 / F-2: content_products queries often look up products linked to a
-- published content item, but the only index is the composite primary key on
-- (content_id, product_id). Reverse (product_id-only) lookups, the
-- ON DELETE CASCADE from products, and the authenticated RLS policy that joins
-- products ON products.id = content_products.product_id all fall back to a
-- sequential scan that worsens as the catalog grows. Add a btree index on
-- product_id.
--
-- CREATE INDEX CONCURRENTLY builds the index without taking an ACCESS EXCLUSIVE
-- lock, so writes to content_products are not blocked while the index is built
-- on a live production table. CONCURRENTLY cannot run inside a transaction
-- block and the Supabase runner wraps each migration file in a transaction by
-- default, so this file opts out via the `-- supabase:no-transaction` directive
-- (same pattern as 2026052303 / 2026053001).
--
-- supabase:no-transaction
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_content_products_product_id
  ON content_products(product_id);
