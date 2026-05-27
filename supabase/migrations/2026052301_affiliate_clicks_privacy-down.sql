-- Rollback 2026052301: Remove privacy columns from affiliate_clicks
DROP INDEX IF EXISTS affiliate_clicks_dedup_idx;
ALTER TABLE public.affiliate_clicks DROP COLUMN IF EXISTS fingerprint;
ALTER TABLE public.affiliate_clicks DROP COLUMN IF EXISTS ip_prefix;
