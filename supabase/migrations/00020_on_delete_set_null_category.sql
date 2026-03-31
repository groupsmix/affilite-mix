-- Fix 2.6: Add ON DELETE SET NULL to content.category_id and products.category_id
-- so deleting a category does not cascade-delete or orphan content/products.

-- content.category_id
ALTER TABLE content
  DROP CONSTRAINT IF EXISTS content_category_id_fkey,
  ADD CONSTRAINT content_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE SET NULL;

-- products.category_id
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_category_id_fkey,
  ADD CONSTRAINT products_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES categories(id)
    ON DELETE SET NULL;
