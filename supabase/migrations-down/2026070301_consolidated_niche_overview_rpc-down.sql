-- Down migration for 2026070301_consolidated_niche_overview_rpc
-- Reverts the three consolidated RPC functions.

DROP FUNCTION IF EXISTS get_multi_niche_overview(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS get_domain_performance(timestamptz);
DROP FUNCTION IF EXISTS get_revenue_per_site(timestamptz);
