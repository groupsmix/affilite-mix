-- DB-13: Make idx_affiliate_clicks_click_id actually partial.
--
-- Problem: Header comment in 00056 promises WHERE click_id IS NOT NULL,
-- but the actual statement omits the WHERE clause. The index allocates
-- leaf entries for every legacy NULL row.
--
-- Fix: Drop and recreate with the partial predicate. Uses CONCURRENTLY
-- to avoid locking the table during the build.

-- Drop the existing non-partial index
DROP INDEX IF EXISTS idx_affiliate_clicks_click_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_clicks_click_id
  ON public.affiliate_clicks(click_id)
  WHERE click_id IS NOT NULL;
