-- A32 / DB-2: content_products queries often look up products linked to a
-- published content item, but the only index is the composite primary key on
-- (content_id, product_id). Public reads and dashboard lookups filtering by
-- product_id alone perform a full seq scan. Add a btree index on product_id.
CREATE INDEX IF NOT EXISTS idx_content_products_product_id
  ON content_products(product_id);
