-- ============================================================
-- Migration 2026062004: Tenant-scope the commission dedup index
-- ============================================================
--
-- Problem (cross-tenant revenue clobber):
--   2026062003 made the dedup arbiter a FULL unique index on (network, order_id).
--   But affiliate order_ids are unique only within a tenant's network account,
--   not globally. Two sites reporting the same (network, order_id) collide: the
--   second site's upsert ON CONFLICT (network, order_id) DO UPDATE overwrites the
--   first site's row, silently reassigning commission revenue across tenants.
--   (Masked today only because the dedup SELECT throws under the F-API-01 guard;
--   fixing that in lib/dal/commissions.ts exposes the clobber, so the schema and
--   DAL changes must ship together.)
--
-- Fix: rebuild the arbiter as (site_id, network, order_id), still FULL /
--   non-partial so it remains a valid PostgREST upsert ON CONFLICT arbiter.
--   (A partial index is NOT a valid arbiter: see 2026062003.)
--
-- Safety: the new key is a superset of the old one, so existing rows (already
--   unique on (network, order_id)) are trivially unique on
--   (site_id, network, order_id); the index build cannot fail on live data.
--   order_id is already NOT NULL (backfilled in 2026062003).
--
-- Lock note: this DROP + CREATE briefly leaves no unique arbiter and takes an
--   ACCESS EXCLUSIVE lock while the index builds. The commissions table is small
--   and ingest is a nightly cron (currently failing), so the window is inert.
--   For a hot/large table prefer CREATE UNIQUE INDEX CONCURRENTLY under a temp
--   name, then DROP the old index and rename (cannot run inside a txn block).
-- ============================================================

DROP INDEX IF EXISTS public.idx_commissions_dedup;

CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_dedup
  ON public.commissions (site_id, network, order_id);
