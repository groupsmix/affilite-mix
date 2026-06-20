-- Rollback: 00030b_create_pages (Bug 2)
--
-- Intentional no-op. The forward migration is `CREATE TABLE IF NOT EXISTS
-- public.pages`, and on production the `pages` table pre-existed the migration
-- chain (it was created manually). There, the forward migration is a no-op, so
-- the correct inverse is also a no-op — dropping `pages` here would destroy
-- live data and cascade-drop every policy/grant later migrations attached to
-- it.
--
-- For a clean-room / throwaway replay database that genuinely created `pages`
-- via this migration, an operator may drop it manually and deliberately:
--   DROP TABLE IF EXISTS public.pages CASCADE;
-- We do NOT do that automatically here.

DO $$
BEGIN
  RAISE NOTICE 'down 00030b_create_pages: no-op — pages pre-exists on production; see file header.';
END $$;
