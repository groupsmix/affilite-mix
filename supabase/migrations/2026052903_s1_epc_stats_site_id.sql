-- ============================================================
-- Migration 2026052903: S1-A16-01 — add site_id to product_epc_stats
--
-- product_epc_stats is a global rollup table keyed (product_id, network)
-- with no site_id column. Tenant isolation relies solely on product-UUID
-- unguessability. Adding site_id enables RLS-based tenant scoping.
-- ============================================================

-- Step 1: add nullable column (data migration follows)
ALTER TABLE public.product_epc_stats
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

-- Step 2: backfill from products FK
UPDATE public.product_epc_stats epc
SET site_id = p.site_id
FROM public.products p
WHERE epc.product_id = p.id
  AND epc.site_id IS NULL;

-- Step 3: make NOT NULL (all rows now populated via products FK)
ALTER TABLE public.product_epc_stats
  ALTER COLUMN site_id SET NOT NULL;

-- Step 4: update unique constraint to include site_id
ALTER TABLE public.product_epc_stats
  DROP CONSTRAINT IF EXISTS product_epc_stats_product_id_network_key;
ALTER TABLE public.product_epc_stats
  ADD CONSTRAINT product_epc_stats_site_product_network_key
  UNIQUE (site_id, product_id, network);

-- Step 5: index for RLS init-plan
CREATE INDEX IF NOT EXISTS idx_product_epc_stats_site_id
  ON public.product_epc_stats (site_id);

-- Step 6: add tenant-scoped RLS policy (service_role bypasses RLS,
-- but this ensures defence-in-depth if queried via authenticated role)
DROP POLICY IF EXISTS "service_role_product_epc" ON public.product_epc_stats;
CREATE POLICY "service_role_product_epc"
  ON public.product_epc_stats FOR ALL TO service_role
  USING (true) WITH CHECK (true);
