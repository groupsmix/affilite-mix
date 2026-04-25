-- Down migration
DROP INDEX IF EXISTS idx_products_site_created;
DROP INDEX IF EXISTS idx_content_site_published;

ALTER TABLE products 
  DROP CONSTRAINT IF EXISTS products_site_id_fkey,
  ADD CONSTRAINT products_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites (id);

ALTER TABLE clicks 
  DROP CONSTRAINT IF EXISTS clicks_product_id_fkey,
  ADD CONSTRAINT clicks_product_id_fkey FOREIGN KEY (product_id) REFERENCES products (id);

ALTER TABLE content 
  DROP CONSTRAINT IF EXISTS content_site_id_fkey,
  ADD CONSTRAINT content_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites (id);
