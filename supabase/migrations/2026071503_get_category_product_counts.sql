-- A21 / PERF-2: category product counts previously loaded every active product
-- row for a site and counted in application memory. Push the aggregation down
-- to PostgreSQL so the database returns only one row per category.
CREATE OR REPLACE FUNCTION get_category_product_counts(p_site_id UUID)
RETURNS TABLE(category_id UUID, product_count BIGINT)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT p.category_id, COUNT(*)::BIGINT
  FROM products p
  WHERE p.site_id = p_site_id
    AND p.status = 'active'
    AND p.category_id IS NOT NULL
  GROUP BY p.category_id;
END;
$$;
