-- F-035: Fix missing SET search_path on SECURITY DEFINER function
CREATE OR REPLACE FUNCTION reorder_pages(p_site_id uuid, updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(updates)
  LOOP
    UPDATE pages
    SET sort_order = (item->>'sort_order')::integer
    WHERE id = (item->>'id')::uuid AND site_id = p_site_id;
  END LOOP;
END;
$$;
