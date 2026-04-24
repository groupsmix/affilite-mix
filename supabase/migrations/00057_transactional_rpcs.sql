-- ============================================================
-- Migration 00057: Transactional RPCs for atomic operations
--
-- This migration introduces atomic PostgreSQL RPC functions for
-- operations that involve multiple table writes or complex validations,
-- ensuring transaction safety without relying on the client side.
-- ============================================================

-- Replace multiple separate queries in lib/dal/content-products.ts
-- with a single atomic transaction.
CREATE OR REPLACE FUNCTION set_linked_products(
  p_site_id UUID,
  p_content_id UUID,
  p_links JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_content_exists BOOLEAN;
  v_foreign_products INT;
  v_product_ids UUID[];
BEGIN
  -- 1. Verify content belongs to this site
  SELECT EXISTS (
    SELECT 1 FROM content
    WHERE id = p_content_id AND site_id = p_site_id
  ) INTO v_content_exists;

  IF NOT v_content_exists THEN
    RAISE EXCEPTION 'Content not found for this site';
  END IF;

  -- 2. Verify all products belong to this site (if links exist)
  IF jsonb_array_length(p_links) > 0 THEN
    -- Extract product IDs from the JSON array
    SELECT array_agg((item->>'product_id')::UUID)
    INTO v_product_ids
    FROM jsonb_array_elements(p_links) AS item;

    -- Check if any of these product IDs belong to a DIFFERENT site (or don't exist)
    SELECT COUNT(*)
    INTO v_foreign_products
    FROM unnest(v_product_ids) AS pid
    LEFT JOIN products p ON p.id = pid AND p.site_id = p_site_id
    WHERE p.id IS NULL;

    IF v_foreign_products > 0 THEN
      RAISE EXCEPTION 'One or more products do not belong to this site';
    END IF;
  END IF;

  -- 3. Delete existing links
  DELETE FROM content_products WHERE content_id = p_content_id;

  -- 4. Insert new links
  IF jsonb_array_length(p_links) > 0 THEN
    INSERT INTO content_products (content_id, product_id, sort_order)
    SELECT 
      p_content_id,
      (item->>'product_id')::UUID,
      (item->>'sort_order')::INTEGER
    FROM jsonb_array_elements(p_links) AS item;
  END IF;
END;
$$;
