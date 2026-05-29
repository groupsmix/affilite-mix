-- Down migration for 2026052903

-- Restore original unique constraint
ALTER TABLE public.product_epc_stats
  DROP CONSTRAINT IF EXISTS product_epc_stats_site_product_network_key;
ALTER TABLE public.product_epc_stats
  ADD CONSTRAINT product_epc_stats_product_id_network_key
  UNIQUE (product_id, network);

-- Drop index
DROP INDEX IF EXISTS idx_product_epc_stats_site_id;

-- Drop column
ALTER TABLE public.product_epc_stats
  DROP COLUMN IF EXISTS site_id;

-- Restore original policy
DROP POLICY IF EXISTS "service_role_product_epc" ON public.product_epc_stats;
CREATE POLICY "service_role_product_epc"
  ON public.product_epc_stats FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
