-- Tier-2 audit Finding #3: site-scope the commission dedup unique index.
--
-- Problem: idx_commissions_dedup was UNIQUE (network, order_id) with no site_id,
-- and ingestCommissions upserts onConflict (network, order_id). Two tenants that
-- collide on (network, order_id) — reachable via the site-blind syntheticOrderId
-- used whenever a network omits order_id — would overwrite each other's
-- commission row, reassigning site_id and silently corrupting money records
-- across tenants.
--
-- Fix: make the unique key (site_id, network, order_id). This is a strict
-- SUPERSET of the previous key, so every existing row (already unique on
-- (network, order_id)) stays unique — the rebuild CANNOT fail on existing data.
-- The matching upsert arbiter + existing-row precheck change lives in
-- lib/dal/commissions.ts.
--
-- Deliberately NOT changing syntheticOrderId: folding site_id into that hash
-- would re-key every existing synthetic order_id, so the next ingest (networks
-- are re-polled over a rolling ~7-day window) would INSERT duplicates instead of
-- updating in place. Site-scoping the index + arbiter closes the cross-tenant
-- overwrite without that hazard.
--
-- Runs in a transaction (no CONCURRENTLY): the brief exclusive lock is
-- acceptable for the expected commissions volume. If the table has grown large,
-- convert to CREATE UNIQUE INDEX CONCURRENTLY in a `-- supabase:no-transaction`
-- migration instead.

DROP INDEX IF EXISTS public.idx_commissions_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_dedup
  ON public.commissions (site_id, network, order_id);
