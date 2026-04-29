-- DB-14: Align FTS indexes with query patterns.
--
-- Problem: Queries use .fts (PostgREST) which compiles to
-- to_tsvector(default_config, name) but indexes use 'simple' or
-- 'english' config. Neither matches -> seq-scan.
--
-- Fix: Create GIN indexes using 'english' config on the columns
-- actually queried, and drop the mismatched ones.

-- Drop mismatched FTS indexes
DROP INDEX IF EXISTS idx_products_fts;
DROP INDEX IF EXISTS idx_content_fts;
DROP INDEX IF EXISTS idx_content_fts_title;

-- Create aligned FTS indexes using 'english' config
CREATE INDEX IF NOT EXISTS idx_products_fts_english
  ON public.products
  USING gin (to_tsvector('english', coalesce(name, '')));

CREATE INDEX IF NOT EXISTS idx_content_fts_english
  ON public.content
  USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(meta_description, '')));
