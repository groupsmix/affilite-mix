-- ═══════════════════════════════════════════════════════════════════
-- Migration 2026062401: Re-grant EXECUTE on admin-facing SECURITY
-- DEFINER RPCs to the `authenticated` role.
--
-- Problem:
--   Migration 00083_lock_security_definer_search_path.sql revoked EXECUTE
--   from `PUBLIC`, `anon`, and `authenticated` on EVERY SECURITY DEFINER
--   function in the `public` schema, then granted EXECUTE to
--   `service_role` only. The intent was to lock down cron/webhook-only
--   functions (purge_retention, erase_user, apply_stripe_membership_event,
--   verify_and_set_totp_step, etc.) so a standard Supabase Auth token
--   could never invoke them.
--
--   The dynamic loop was too broad: it also caught two RPCs that the
--   admin dashboard calls through the tenant client (role=authenticated,
--   RLS-enforced, NOT service_role):
--
--     1. set_linked_products(p_site_id uuid, p_content_id uuid, p_links jsonb)
--        Called by lib/dal/content-products.ts → setLinkedProducts(),
--        invoked from PUT /api/admin/content-products, which fires
--        immediately after every content create/edit in the dashboard.
--        The content row itself saves via a direct INSERT/UPDATE (RLS
--        passes), but the product-linking step calls this RPC and gets
--        42501 permission denied. The form surfaces this as "Failed to
--        save" / "could not be updated".
--
--     2. reorder_pages(p_site_id uuid, updates jsonb)
--        Called by lib/dal/pages.ts → reorderPages(),
--        invoked from PUT /api/admin/pages/reorder. Same 42501.
--
--   Both functions are SECURITY DEFINER by design: they perform atomic
--   multi-row writes (delete + insert for links; bulk sort_order update
--   for pages) that must run in a single transaction. They already
--   validate site ownership internally (set_linked_products checks
--   content.site_id = p_site_id and all product.site_id = p_site_id;
--   reorder_pages filters by p_site_id), so granting EXECUTE to
--   `authenticated` does not open a cross-tenant write — the function
--   body rejects a foreign site_id regardless of who calls it.
--
-- Fix:
--   Grant EXECUTE on these two functions back to `authenticated`.
--   service_role already has EXECUTE (it bypasses GRANT checks anyway).
--   anon stays revoked — these are admin-only operations.
--
-- Scope is deliberately narrow: only the two RPCs the admin UI calls
-- through the authenticated tenant client. All other SECURITY DEFINER
-- functions remain service_role-only as 00083 intended.
--
-- Rollback:
--   REVOKE EXECUTE ON FUNCTION public.set_linked_products(uuid, uuid, jsonb) FROM authenticated;
--   REVOKE EXECUTE ON FUNCTION public.reorder_pages(uuid, jsonb) FROM authenticated;
--   (Restores the broken state — do not run unless reverting this fix.)
-- ═══════════════════════════════════════════════════════════════════

-- Guard: only grant if the function exists (idempotent across environments
-- that may not have applied 00057 yet).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'set_linked_products'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.set_linked_products(uuid, uuid, jsonb) TO authenticated;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'reorder_pages'
  ) THEN
    GRANT EXECUTE ON FUNCTION public.reorder_pages(uuid, jsonb) TO authenticated;
  END IF;
END;
$$;
