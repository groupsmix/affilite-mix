-- Rollback 00097: Remove is_internal column and revert analytics RPCs
ALTER TABLE public.affiliate_clicks DROP COLUMN IF EXISTS is_internal;

-- Revert RPCs to original versions without is_internal filter.
-- NOTE: These functions must be manually verified against their pre-00097 state
-- if the migration predates stored originals.
DROP FUNCTION IF EXISTS get_top_products(uuid, timestamptz, int);
DROP FUNCTION IF EXISTS get_top_referrers(uuid, timestamptz, int);
DROP FUNCTION IF EXISTS get_top_content_slugs(uuid, timestamptz, int);
DROP FUNCTION IF EXISTS get_daily_clicks(uuid, timestamptz);
