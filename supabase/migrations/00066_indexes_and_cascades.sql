-- 43. Review indexes for real query patterns
-- Adding compound indexes for listing, searching, and ingestion
CREATE INDEX IF NOT EXISTS idx_products_site_created ON products (site_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_site_published ON content (site_id, published_at DESC) WHERE status = 'published';

-- 49. Check orphan records and cascades
-- Updating foreign keys to ensure ON DELETE CASCADE is properly set
ALTER TABLE products 
  DROP CONSTRAINT IF EXISTS products_site_id_fkey,
  ADD CONSTRAINT products_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE;

ALTER TABLE clicks 
  DROP CONSTRAINT IF EXISTS clicks_product_id_fkey,
  ADD CONSTRAINT clicks_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE;

ALTER TABLE content 
  DROP CONSTRAINT IF EXISTS content_site_id_fkey,
  ADD CONSTRAINT content_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites (id) ON DELETE CASCADE;
