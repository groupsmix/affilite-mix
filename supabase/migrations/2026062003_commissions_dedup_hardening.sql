-- ============================================================
-- Migration 2026062003: Harden commission dedup (Bug 6)
-- ============================================================
--
-- Problem (duplicate commission rows every ingest):
--   00048_commissions_and_epc.sql created a PARTIAL unique dedup index:
--     CREATE UNIQUE INDEX idx_commissions_dedup
--       ON commissions (network, order_id) WHERE order_id IS NOT NULL;
--   Two failures follow:
--     1. Rows whose network omits order_id (order_id IS NULL) are excluded
--        from the index, so they duplicate on every nightly ingest.
--     2. A partial unique index cannot serve as an ON CONFLICT arbiter through
--        PostgREST/supabase-js `.upsert({ onConflict: "network,order_id" })`,
--        so the DAL could not upsert and instead INSERTed + counted "skipped".
--
-- Fix (schema half; the DAL half lives in lib/dal/commissions.ts):
--   Make order_id reliably present and the dedup index FULL (non-partial) so it
--   is a valid upsert arbiter on (network, order_id).
--
-- Safe / backward-compatible ordering:
--   a) Backfill existing NULL order_ids with a guaranteed-unique sentinel
--      ('legacy_' || id) BEFORE adding NOT NULL / the unique index, so neither
--      can fail on live data. id is the primary key, so these never collide
--      with each other; the 'legacy_' prefix avoids collision with real,
--      network-supplied order_ids (which the old partial index already kept
--      unique per network).
--   b) Enforce NOT NULL.
--   c) Swap the partial index for a full unique index of the same name.
-- ============================================================

-- (a) Backfill legacy rows that have no network order id.
UPDATE public.commissions
   SET order_id = 'legacy_' || id::text
 WHERE order_id IS NULL;

-- (b) Going forward, order_id is always present (the DAL synthesizes a stable
--     key when a network omits one — see lib/dal/commissions.ts).
ALTER TABLE public.commissions
  ALTER COLUMN order_id SET NOT NULL;

-- (c) Replace the partial dedup index with a full unique index so it both
--     covers every row and is usable as the upsert ON CONFLICT arbiter.
DROP INDEX IF EXISTS public.idx_commissions_dedup;
CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_dedup
  ON public.commissions (network, order_id);
