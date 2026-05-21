-- Irreversible security hardening migration.
--
-- The forward migration removes dynamic SQL from SECURITY DEFINER erasure logic,
-- scopes drip_enrollments erasure through drip_campaigns.site_id, and adds
-- defensive Stripe webhook RPC checks. Rolling it back would reintroduce A25
-- risks, so this down migration is intentionally a no-op.
SELECT 1;
