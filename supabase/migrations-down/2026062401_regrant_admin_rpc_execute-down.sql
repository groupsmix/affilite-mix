-- 2026062401_regrant_admin_rpc_execute-down
--
-- Rollback for 2026062401_regrant_admin_rpc_execute.sql.
--
-- Re-revokes EXECUTE on set_linked_products and reorder_pages from the
-- authenticated role, restoring the (broken) 00083 lockdown state.
--
-- WARNING: running this rollback re-introduces the dashboard save bug
-- where content product-linking and page reordering fail with 42501.
-- Only run if you need to revert the fix and accept that admin saves
-- will break again. Re-apply 2026062401 immediately afterwards.
--
-- Rollback of the rollback (i.e. re-applying the fix):
--   GRANT EXECUTE ON FUNCTION public.set_linked_products(uuid, uuid, jsonb) TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.reorder_pages(uuid, jsonb) TO authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_linked_products'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.set_linked_products(uuid, uuid, jsonb) FROM authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reorder_pages'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.reorder_pages(uuid, jsonb) FROM authenticated;
  END IF;
END;
$$;
