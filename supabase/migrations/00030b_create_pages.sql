-- ============================================================
-- Migration 00030b: Create the `pages` table (Bug 2)
-- ============================================================
--
-- Problem (fresh-DB replay aborts):
--   The `pages` table was created MANUALLY on the production database
--   before the migration chain was established, so no up-migration file
--   ever ran `CREATE TABLE pages`. Yet migrations 00026/00031/00035/00060/
--   00074/00092 reference it (RPC body, RLS policies, GRANT/REVOKE). On a
--   from-scratch replay the first hard failure is 00031's
--   `CREATE POLICY ... ON pages` — `relation "pages" does not exist`.
--   CI papered over this with a hand-written bootstrap table in
--   .github/workflows/ci.yml; this migration backfills the real thing.
--
-- Fix:
--   Create `pages` here, numbered to sort BETWEEN 00030_* and 00031_* so the
--   table exists before the first migration that references it. The columns,
--   nullability and FK mirror the live production schema as introspected in
--   types/supabase.ts (public.pages) and exercised by lib/dal/pages.ts.
--
--   `CREATE TABLE IF NOT EXISTS` makes this a safe no-op on production and on
--   the existing CI bootstrap (the table already exists there) while making a
--   clean-room replay succeed.
--
--   Numbering note: a letter-suffixed version ("00030b") is used deliberately
--   so existing migrations are NOT renumbered. It sorts after 00030_* and
--   before 00031_* under the same lexicographic ordering the Supabase CLI and
--   the CI psql replay loop use.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  slug         text        NOT NULL,
  title        text        NOT NULL,
  body         text,
  is_published boolean     DEFAULT false,
  sort_order   integer     DEFAULT 0,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (site_id, slug)
);

-- Match the production privacy posture. Public read access is (re)granted and
-- gated by the policies defined in later migrations (00031, 00074, ...); RLS is
-- enabled here so a clean-room replay reproduces the same enforced state as
-- production rather than leaving the freshly-created table open.
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
